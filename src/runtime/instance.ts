// ============================================================================
// AgentInstance — async generator wrapping the conversation loop.
// ============================================================================

import { agentRegistry, getAgent } from "../agents/mod.ts";
import { askManager } from "../tools/ask.ts";
import { bus } from "../tools/bus.ts";
import { executeCode, executeCodeBg } from "../tools/code_exec.ts";
import type { CodeLang } from "../tools/code_exec.ts";
import { runStreamLoop } from "../engine.ts";
import { TaskManager } from "../tools/tasks.ts";
import { generateSummary as generateSummaryFromMessages } from "./subagent.ts";
import { goalManager } from "../tools/goal.ts";
import { TodoBoard } from "../tools/todo.ts";
import { timerManager } from "../tools/timers.ts";
import { Config } from "../config.ts";
import { getProviderForModel, loadAgentsMd, resolveModelTier, setStartBalance } from "../transport.ts";
import { runEval } from "../tools/eval.ts";
import { get, launch, unregister, waitFor } from "./scheduler.ts";
import type {
    AgentEvent,
    AgentKind,
    AgentManifest,
    AssistantMessage,
    LaunchOptions,
    Message,
    SystemMessage,
    ToolCall,
    ToolMessage,
    UserMessage,
} from "../types.ts";

export class AgentInstance {
    readonly id: string;
    readonly name: string;
    readonly manifest: AgentManifest;
    status: "running" | "paused" | "terminated" = "running";

    #messages: Message[];
    #model: string;
    #taskManager: TaskManager;
    readonly #board = new TodoBoard();
    #reasoningEffort: string;
    #accumulatedCost = 0;
    #forkSeq = 0;
    #spawnSeq = 0;
    #autoTerminate = false; // sub-agents self-terminate when idle
    // Direct-message channel — user input bypasses the todo queue entirely
    #directMsg: string | null = null;
    #directResolve: (() => void) | null = null;
    #controller: AbortController | null = null;
    #completionResolve: ((summary: string) => void) | null = null;
    readonly #completionPromise: Promise<string>;
    #onEvent: ((e: AgentEvent) => void) | null = null;

    get completionPromise(): Promise<string> {
        return this.#completionPromise;
    }

    constructor(opts: LaunchOptions, id: string) {
        let resolveCompletion!: (s: string) => void;
        this.#completionPromise = new Promise((r) => {
            resolveCompletion = r;
        });
        this.#completionResolve = resolveCompletion;
        this.id = id;
        this.name = opts.name;

        const agentId = opts.kind ?? "minion";
        const base = getAgent(agentId);
        if (!base) throw new Error(`Unknown agent: ${agentId}`);

        const agentsMd = opts.agentsMd ?? loadAgentsMd();
        let systemPrompt = opts.systemPrompt ?? base.systemPrompt;
        if (opts.toolHints) systemPrompt += opts.toolHints;

        // Session metadata — stable per session, placed before AGENTS.md for KV-cache.
        const startedAt = new Date().toISOString();
        const cwd = Deno.cwd();
        const hostname = (() => {
            try {
                return Deno.hostname();
            } catch {
                return "unknown";
            }
        })();
        systemPrompt += `\n\n[Session]\nStarted: ${startedAt}\nWorking directory: ${cwd}\nHost: ${hostname}`;

        // Available agent types for fork/spawn
        const agentList = agentRegistry.map((a) => `- ${a.kind} (${a.modelTier}): ${a.description}`).join("\n");
        systemPrompt += `\n\n[Available Agents]\n${agentList}`;

        if (agentsMd) systemPrompt += "\n\n[AGENTS.md]\n" + agentsMd;

        this.manifest = { ...base, systemPrompt };
        this.#model = opts.model ?? resolveModelTier(base.modelTier);
        this.#messages = [{ role: "system", content: systemPrompt } as SystemMessage];
        this.#reasoningEffort = Config.reasoning.defaultEffort;
        this.#autoTerminate = opts.autoTerminate ?? false;
        this.#taskManager = new TaskManager(Deno.makeTempDirSync({ prefix: "agent_" }));

        bus.register(this.id);
        getProviderForModel(this.#model).getBalance().then((b) => {
            const info = b.balance_infos[0];
            if (info) setStartBalance(info.total_balance);
        }).catch(() => {});
    }

    get messages(): Message[] {
        return this.#messages;
    }
    get model(): string {
        return this.#model;
    }
    get taskManager(): TaskManager {
        return this.#taskManager;
    }
    get board(): TodoBoard {
        return this.#board;
    }
    get reasoningEffort(): string {
        return this.#reasoningEffort;
    }
    set reasoningEffort(v: string) {
        this.#reasoningEffort = v;
    }

    // -- lifecycle -------------------------------------------------------------

    send(text: string): void {
        // Direct user input — never goes through the queue.
        // Does NOT interrupt the current LLM turn; takes effect next.
        this.#directMsg = text;
        this.#directResolve?.();
        this.#directResolve = null;
    }

    pause(): void {
        this.status = "paused";
        this.#onEvent?.({ type: "paused" });
    }

    resume(): void {
        if ((this.status as string) === "paused") {
            this.status = "running";
            // Trigger direct channel to unpause the run loop
            this.#directMsg = "";
            this.#directResolve?.();
            this.#directResolve = null;
        }
    }

    terminate(): void {
        this.status = "terminated";
        this.#controller?.abort();
        timerManager.cleanup();
        this.#taskManager.cleanup();
        unregister(this.id);
        const summary = generateSummaryFromMessages(this.#messages);
        this.#completionResolve?.(summary);
        this.#onEvent?.({ type: "terminated" });
    }

    // -- input -----------------------------------------------------------------

    /** Wait for input from either the direct channel (user) or the todo queue. */
    async #takeInput(): Promise<{ text: string; fromQueue: boolean }> {
        // Direct message already waiting?
        if (this.#directMsg !== null) {
            const text = this.#directMsg;
            this.#directMsg = null;
            return { text, fromQueue: false };
        }
        // Race: direct channel vs todo queue
        const directPromise = new Promise<{ text: string; fromQueue: boolean }>((resolve) => {
            this.#directResolve = () => {
                const text = this.#directMsg!;
                this.#directMsg = null;
                resolve({ text, fromQueue: false });
            };
        });
        const queuePromise = this.#board.take().then((text) => ({ text, fromQueue: true }));
        const result = await Promise.race([directPromise, queuePromise]);
        // Clean up direct listener if queue won (the losing promise is GC'd — no leak)
        this.#directResolve = null;
        return result;
    }

    // -- generator -------------------------------------------------------------

    async *run(onEvent: (e: AgentEvent) => void): AsyncGenerator<AgentEvent> {
        this.#onEvent = onEvent;
        this.status = "running";

        while ((this.status as string) !== "terminated") {
            if ((this.status as string) === "paused") {
                yield { type: "paused" };
                continue;
            }
            if ((this.status as string) === "terminated") break;

            const { text, fromQueue } = await this.#takeInput();
            if ((this.status as string) === "terminated" || (this.status as string) === "paused") continue;
            if (!text || text.startsWith("/")) continue;

            if (fromQueue) {
                const remaining = this.#board.queueLength;
                const prefix = remaining > 0
                    ? `[待办队列] 正在处理队列中的提示词（剩余 ${remaining} 项）。完成后将继续处理下一项。\n\n`
                    : "[待办队列] 正在处理队列中的最后一项。完成后将等待新输入。\n\n";
                this.#messages.push({ role: "system", content: prefix } as SystemMessage);
            }
            this.#messages.push({ role: "user", content: text } as UserMessage);
            yield { type: "user_message", text };

            const todoCtx = this.#board.toSystemPrompt();
            const goalCtx = goalManager.toSystemPrompt();
            if (todoCtx) this.#messages.push({ role: "system", content: todoCtx } as SystemMessage);
            if (goalCtx) this.#messages.push({ role: "system", content: goalCtx } as SystemMessage);

            // Conversation loop
            let keepGoing = true;
            while (keepGoing && this.status === "running") {
                if ((this.status as string) === "terminated" || (this.status as string) === "paused") break;

                this.#controller = new AbortController();
                let accumInput = 0;

                const result = await runStreamLoop(
                    this.#model,
                    this.#messages,
                    (text) => this.#onEvent?.({ type: "thinking", text, reasoning: "" }),
                    (reasoning) => this.#onEvent?.({ type: "thinking", text: "", reasoning }),
                    () => {},
                    Config.tools.filter((t) => !(this.manifest.disableTools ?? []).includes(t.function.name)).map((t) =>
                        t.function.name
                    ),
                    this.#reasoningEffort,
                );

                if (result.usage) {
                    accumInput += result.usage.prompt_tokens ?? 0;
                    const price = Config.pricing[this.#model];
                    if (price) {
                        const hit = result.usage.prompt_cache_hit_tokens ?? 0;
                        const miss = Math.max(0, (result.usage.prompt_tokens ?? 0) - hit);
                        this.#accumulatedCost += (miss / 1_000_000) * price.input;
                        this.#accumulatedCost += (hit / 1_000_000) * price.cacheHit;
                        this.#accumulatedCost += (result.usage.completion_tokens ?? 0) / 1_000_000 * price.output;
                    }
                }

                if (result.finishReason === "tool_calls") {
                    const assistantMsg: AssistantMessage = {
                        role: "assistant",
                        content: result.content,
                        reasoning_content: result.reasoning || null,
                        tool_calls: result.toolCalls,
                    };
                    this.#messages.push(assistantMsg);
                    yield { type: "tool_calls", calls: result.toolCalls };

                    const toolMsgs: ToolMessage[] = [];
                    for (const tc of result.toolCalls) {
                        try {
                            const tm = await this.#executeTool(tc);
                            toolMsgs.push(tm);
                        } catch (err) {
                            toolMsgs.push({
                                role: "tool",
                                tool_call_id: tc.id,
                                content: JSON.stringify({
                                    error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
                                }),
                            });
                        }
                    }
                    this.#messages.push(...toolMsgs);
                    yield {
                        type: "tool_results",
                        results: toolMsgs,
                        inputTokens: result.usage?.prompt_tokens,
                        outputTokens: result.usage?.completion_tokens,
                        cacheHitTokens: result.usage?.prompt_cache_hit_tokens,
                        cacheMissTokens: result.usage?.prompt_cache_miss_tokens,
                        reasoningTokens: result.usage?.completion_tokens_details?.reasoning_tokens,
                    };
                } else {
                    const assistantMsg: AssistantMessage = {
                        role: "assistant",
                        content: result.content,
                        reasoning_content: result.reasoning || null,
                    };
                    this.#messages.push(assistantMsg);
                    yield {
                        type: "response",
                        message: assistantMsg,
                        inputTokens: result.usage?.prompt_tokens ?? 0,
                        outputTokens: result.usage?.completion_tokens ?? 0,
                        cacheHitTokens: result.usage?.prompt_cache_hit_tokens,
                        cacheMissTokens: result.usage?.prompt_cache_miss_tokens,
                        reasoningTokens: result.usage?.completion_tokens_details?.reasoning_tokens,
                    };
                    keepGoing = false;
                }
            }
            // Budget check
            if (Config.budget.limitCny > 0 && this.#accumulatedCost >= Config.budget.limitCny) {
                this.status = "paused";
                yield {
                    type: "error",
                    message: `预算耗尽: ¥${
                        this.#accumulatedCost.toFixed(2)
                    } / ¥${Config.budget.limitCny}。使用 /budget 调整。`,
                };
                continue;
            }
            // Goal auto-continue: if goal active, push next turn
            goalManager.incrementTurn();
            if (goalManager.active) {
                this.#board.addToQueue("继续执行目标。检查当前进度，如果目标已达成则报告完成。");
            }
            // Sub-agents self-terminate when queue is empty and no goal is active
            if (this.#autoTerminate && this.#board.queueLength === 0 && !goalManager.active) {
                this.terminate();
                return;
            }
            if (this.status === "running") yield { type: "idle" };
        }
    }

    async #executeTool(tc: ToolCall): Promise<ToolMessage> {
        const args = (() => {
            try {
                return JSON.parse(tc.function.arguments) as Record<string, unknown>;
            } catch {
                return {};
            }
        })();
        const tm = this.#taskManager;

        switch (tc.function.name) {
            case "bash":
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify((await tm.spawn(args as unknown as import("../types.ts").BashArgs)).result),
                };
            case "bash_input":
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify(
                        tm.sendStdin(args.task_id as string, (args.content as string) || "")
                            ? { sent: true }
                            : { error: "task not running" },
                    ),
                };
            case "bash_output":
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify(tm.readOutput(args.task_id as string) ?? { error: "task not found" }),
                };
            case "list_background_tasks":
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({
                        tasks: tm.list().map((t) => ({
                            id: t.id,
                            command: t.command,
                            status: t.status,
                            startedAt: t.startedAt,
                            finishedAt: t.finishedAt,
                            exitCode: t.exitCode,
                        })),
                    }),
                };
            case "get_task_status":
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify(tm.get(args.task_id as string) ?? { error: "task not found" }),
                };
            case "list_agents":
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ agents: bus.listAgents() }) };
            case "send_message":
                bus.send(this.id, args.to as string, args.content as string);
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ sent: true }) };
            case "receive_messages":
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ messages: bus.recv(this.id) }) };
            case "sleep":
                timerManager.sleep((args.seconds as number) || 0).then(() => {
                    this.send("[sleep done]");
                });
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ sleeping: args.seconds }) };
            case "view_todo": {
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({ count: this.#board.queueLength, items: [...this.#board.queueItems] }),
                };
            }
            case "_old_get_prompt_queue":
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({ count: this.#board.queueLength, items: [...this.#board.queueItems] }),
                };
            case "todo_write": {
                const items = (args.items as Array<{ id?: number; text: string; status: string }>) || [];
                const updated = this.#board.updateTodos(
                    items as Array<{ id?: number; text: string; status: "pending" | "in_progress" | "completed" }>,
                );
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ todos: updated }) };
            }
            case "eval": {
                const code = (args.code as string) || "";
                const logs: string[] = [];
                let value: unknown;
                for await (
                    const ev of runEval(code, {
                        bash: async (cmd, stdin, bg, cwd) =>
                            (await tm.spawn({ command: cmd, stdin, background: bg, cwd })).result,
                        fork: (opts) => {
                            const inst = launch({
                                name: opts?.name || `${this.name}-f${++this.#forkSeq}`,
                                kind: this.manifest.kind,
                                systemPrompt: opts?.prompt,
                                autoTerminate: true,
                            });
                            inst.send("请开始执行你的任务。");
                            return inst.id;
                        },
                        spawn: (opts) => {
                            const inst = launch({
                                name: opts.name || `${this.name}-s${++this.#spawnSeq}`,
                                kind: (opts.kind as AgentKind) || this.manifest.kind,
                                systemPrompt: opts.prompt,
                                autoTerminate: true,
                            });
                            inst.send("请开始执行你的任务。");
                            return inst.id;
                        },
                        join: async (idOrIds) => {
                            const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
                            for (const id of ids) {
                                const target = get(id);
                                if (target) {
                                    target.board.addToQueue(
                                        "你的任务已完成，请总结你的执行过程和结果，不要调用任何工具，直接输出摘要后结束。",
                                    );
                                }
                            }
                            const results = await Promise.all(ids.map((id) => waitFor(id)));
                            return Array.isArray(idOrIds) ? results : results[0];
                        },
                        send: (to, content) => bus.send(this.id, to, content),
                        recv: () => bus.recv(this.id),
                        agents: () => bus.listAgents(),
                        agentId: () => this.id,
                        sleep: async (s) => {
                            await timerManager.sleep(s);
                        },
                        import: (spec: string) => import(spec),
                    })
                ) {
                    if (ev.log) logs.push(ev.log);
                    if (ev.error) {
                        return {
                            role: "tool",
                            tool_call_id: tc.id,
                            content: JSON.stringify({ error: ev.error, logs }),
                        };
                    }
                    if (ev.value !== undefined) value = ev.value;
                }
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ value, logs }) };
            }
            case "ask_user": {
                const questions = (args.questions as Array<{ text: string; options?: string[] }>) || [];
                if (questions.length === 0) {
                    return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "no questions" }) };
                }
                const answers = await askManager.ask(questions);
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ answers }) };
            }
            case "exec": {
                const lang = (args.language as string) || "bash";
                const code = (args.code as string) || "";
                const r = args.background
                    ? await executeCodeBg(lang as CodeLang, code, tm)
                    : await executeCode(lang as CodeLang, code);
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(r) };
            }
            case "fork_agent": {
                const inst = launch({
                    name: (args.name as string) || `${this.name}-f${++this.#forkSeq}`,
                    kind: this.manifest.kind,
                    model: args.model as string | undefined,
                    systemPrompt: args.prompt as string | undefined,
                    autoTerminate: true,
                });
                inst.send("请开始执行你的任务。");
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({ agent_id: inst.id, message: "Use join_agent to collect results." }),
                };
            }
            case "spawn_agent": {
                const inst = launch({
                    name: (args.name as string) || `${this.name}-s${++this.#spawnSeq}`,
                    kind: (args.kind as AgentKind) || this.manifest.kind,
                    model: args.model as string | undefined,
                    systemPrompt: args.prompt as string,
                    autoTerminate: true,
                });
                inst.send("请开始执行你的任务。");
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({ agent_id: inst.id, message: "Use join_agent to collect results." }),
                };
            }
            case "join_agent": {
                const targetId = args.agent_id as string;
                // Queue a join request — won't interrupt the sub-agent mid-turn
                const target = get(targetId);
                if (target) {
                    target.board.addToQueue(
                        "你的任务已完成，请总结你的执行过程和结果，不要调用任何工具，直接输出摘要后结束。",
                    );
                }
                const summary = await waitFor(targetId);
                return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ summary }) };
            }
            case "alarm":
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({
                        alarm_id: timerManager.setAlarm(
                            (args.seconds as number) || 0,
                            (args.target_agent as string) || this.id,
                            (args.message as string) || "",
                        ),
                    }),
                };
            default:
                return {
                    role: "tool",
                    tool_call_id: tc.id,
                    content: JSON.stringify({ error: `unknown tool: ${tc.function.name}` }),
                };
        }
    }
}
