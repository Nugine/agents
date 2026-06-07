// ============================================================================
// App — main conversation UI, consumes AgentEvents from AgentInstance.
// ============================================================================

import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getCommandNames, getCommandSyntax, handleCommand } from "../commands/mod.ts";
import "../commands/handlers.ts";
import { Config } from "../config.ts";
import { formatTokens, printSummary } from "../format.ts";
import { agentRegistry, getAgent } from "../agents/mod.ts";
import type { AgentInstance } from "../runtime/mod.ts";
import { launch } from "../runtime/mod.ts";
import { loadAgentsMd } from "../transport.ts";
import { detectAvailableTools } from "../tools/detect.ts";
import type { AgentManifest } from "../types.ts";
import { goalManager } from "../tools/goal.ts";
import { timerManager } from "../tools/timers.ts";
import { defaultModels, getProvider, getProviderForModel, setStartBalance } from "../transport.ts";
import type {
    AgentEvent,
    AppStatus,
    BalanceInfo,
    Message,
    ModelInfo,
    SystemMessage,
    ToolCall,
    ToolMessage,
} from "../types.ts";
import { sessionStats } from "../runtime/scheduler.ts";
import { InputBar } from "./input.tsx";
import { MessageArea, StreamingLine } from "./messages.tsx";
import { ModelPanel } from "./model_panel.tsx";
import { AgentSelector } from "./selectors.tsx";
import { HDivider, StatusBar } from "./status.tsx";
import { TasksPanel } from "./tasks_panel.tsx";
import { TodoPanel } from "./todo_panel.tsx";

function App(props: { instance: AgentInstance }) {
    const inst = props.instance;

    const [messages, setMessages] = useState<Message[]>(inst.messages);
    const [status, setStatus] = useState<AppStatus>("idle");
    const [currentModel, setCurrentModel] = useState<string>(inst.model);
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [showModelPanel, setShowModelPanel] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const [streamingReasoning, setStreamingReasoning] = useState("");
    const [toolCallBuf, setToolCallBuf] = useState<ToolCall[]>([]);
    const [reasoningExpanded, setReasoningExpanded] = useState(false);
    const [systemExpanded, setSystemExpanded] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [cursorPos, setCursorPos] = useState(0);
    const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
    const [showTodoPanel, setShowTodoPanel] = useState(false);
    const [showTasksPanel, setShowTasksPanel] = useState(false);
    const [balance, setBalance] = useState<BalanceInfo | null>(null);
    const [balanceTime, setBalanceTime] = useState<Date | null>(null);
    const [balanceError, setBalanceError] = useState<string | null>(null);
    const [statsTick, setStatsTick] = useState(0);
    const stats = sessionStats; // shared mutable — tick forces re-render on change
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [turnTokens, setTurnTokens] = useState<{ output: number }>({ output: 0 });
    const [turnDuration, setTurnDuration] = useState<number>(0);
    const turnStartRef = useRef<number>(0);
    const ctrlCPressed = useRef(false);
    const startBalanceRef = useRef<string | null>(null);
    const inflightRef = useRef(false); // tracks whether we've counted this API call

    const commandSuggestions = useMemo(() => {
        if (!inputValue.startsWith("/") || inputValue.length < 2) return [];
        const prefix = inputValue.slice(1).toLowerCase();
        return getCommandNames()
            .filter((c) => c.startsWith(prefix))
            .slice(0, 5)
            .map((c) => getCommandSyntax(c));
    }, [inputValue]);

    useEffect(() => {
        if (commandFeedback) {
            const t = setTimeout(() => setCommandFeedback(null), 10_000);
            return () => clearTimeout(t);
        }
    }, [commandFeedback]);
    useEffect(() => {
        getProvider().listModels().then(setAvailableModels).catch(() => setAvailableModels(defaultModels()));
    }, []);
    useEffect(() => {
        if (balance && !startBalanceRef.current) {
            startBalanceRef.current = balance.balance_infos[0]?.total_balance ?? null;
        }
    }, [balance]);

    const refreshBalance = useCallback(() => {
        getProviderForModel(currentModel).getBalance().then((b) => {
            setBalance(b);
            setBalanceTime(new Date());
            setBalanceError(null);
            const info = b.balance_infos[0];
            if (info) {
                setStartBalance(info.total_balance);
                if (!startBalanceRef.current) startBalanceRef.current = info.total_balance;
            }
        }).catch((err) => {
            setBalanceError(err.message);
            setBalanceTime(new Date());
        });
    }, []);
    useEffect(() => {
        refreshBalance();
        const i = setInterval(refreshBalance, Config.balance.pollIntervalMs);
        return () => clearInterval(i);
    }, [refreshBalance]);

    const lastMsgCount = useRef(0);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flushMessages = useCallback(() => {
        if (flushTimerRef.current) return; // already scheduled
        flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null;
            if (inst.messages.length !== lastMsgCount.current) {
                lastMsgCount.current = inst.messages.length;
                setMessages([...inst.messages]);
            }
        }, 50);
    }, [inst]);

    // Throttle streaming updates — SSE fires per-token, React re-renders on each
    const streamBuf = useRef({ text: "", reasoning: "" });
    const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flushStream = useCallback(() => {
        if (streamTimerRef.current) return;
        streamTimerRef.current = setTimeout(() => {
            streamTimerRef.current = null;
            setStreamingText(streamBuf.current.text);
            setStreamingReasoning(streamBuf.current.reasoning);
        }, 80);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            for await (
                const ev of inst.run((e) => {
                    if (!cancelled) dispatch(e);
                })
            ) {
                if (cancelled) break;
                dispatch(ev);
            }
        })();
        return () => {
            cancelled = true;
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
            if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
        };

        function dispatch(ev: AgentEvent) {
            switch (ev.type) {
                case "thinking":
                    if (!inflightRef.current) {
                        inflightRef.current = true;
                        sessionStats.inFlightCalls++;
                    }
                    setStatus("thinking");
                    streamBuf.current = { text: ev.text, reasoning: ev.reasoning };
                    flushStream();
                    break;
                case "tool_calls":
                    if (inflightRef.current) {
                        inflightRef.current = false;
                        sessionStats.inFlightCalls = Math.max(0, sessionStats.inFlightCalls - 1);
                    }
                    // Generation phase done — flush and clear
                    if (streamTimerRef.current) {
                        clearTimeout(streamTimerRef.current);
                        streamTimerRef.current = null;
                    }
                    streamBuf.current = { text: "", reasoning: "" };
                    setStreamingText("");
                    setStreamingReasoning("");
                    setStatus("tool_running");
                    setToolCallBuf(ev.calls);
                    break;
                case "tool_results":
                    flushMessages();
                    setToolCallBuf([]);
                    // Don't pre-set "thinking" — the next real thinking event will transition
                    sessionStats.toolCallCount += ev.results.length;
                    sessionStats.totalInputTokens += ev.inputTokens ?? 0;
                    sessionStats.totalOutputTokens += ev.outputTokens ?? 0;
                    if (ev.inputTokens) sessionStats.currentContextTokens = ev.inputTokens;
                    sessionStats.totalCacheHitTokens += ev.cacheHitTokens ?? 0;
                    sessionStats.totalCacheMissTokens += ev.cacheMissTokens ?? 0;
                    sessionStats.totalReasoningTokens += ev.reasoningTokens ?? 0;
                    sessionStats.apiCallCount += 1;
                    setStatsTick((t) => t + 1);
                    break;
                case "response":
                    if (inflightRef.current) {
                        inflightRef.current = false;
                        sessionStats.inFlightCalls = Math.max(0, sessionStats.inFlightCalls - 1);
                    }
                    flushMessages();
                    if (streamTimerRef.current) {
                        clearTimeout(streamTimerRef.current);
                        streamTimerRef.current = null;
                    }
                    streamBuf.current = { text: "", reasoning: "" };
                    setStatus("idle");
                    setStreamingText("");
                    setStreamingReasoning("");
                    setToolCallBuf([]);
                    setTurnTokens({ output: ev.outputTokens ?? 0 });
                    setTurnDuration((Date.now() - turnStartRef.current) / 1000);
                    sessionStats.totalInputTokens += ev.inputTokens ?? 0;
                    sessionStats.totalOutputTokens += ev.outputTokens ?? 0;
                    if (ev.inputTokens) sessionStats.currentContextTokens = ev.inputTokens;
                    sessionStats.totalCacheHitTokens += ev.cacheHitTokens ?? 0;
                    sessionStats.totalCacheMissTokens += ev.cacheMissTokens ?? 0;
                    sessionStats.totalReasoningTokens += ev.reasoningTokens ?? 0;
                    sessionStats.apiCallCount += 1;
                    setStatsTick((t) => t + 1);
                    break;
                case "idle":
                    setStatus("idle");
                    break;
                case "paused":
                    setStatus("idle");
                    break;
                case "error":
                    setErrorMsg(ev.message);
                    setStatus("error");
                    break;
                case "terminated":
                    break;
                case "user_message":
                    inflightRef.current = false;
                    flushMessages();
                    setStatus("thinking");
                    turnStartRef.current = Date.now();
                    setTurnTokens({ output: 0 });
                    break;
            }
            flushMessages();
        }
    }, [inst, flushMessages]);

    const handleSubmit = useCallback(() => {
        const text = inputValue.trim();
        if (!text) return setCursorPos(0);
        setInputValue("");
        setCursorPos(0);
        timerManager.wakeUp();
        if (text.startsWith("/goal ") && text.length > 6) {
            goalManager.set(text.slice(6));
            setCommandFeedback("目标已设置。");
            inst.send("请检查当前进度并开始执行目标。");
            return;
        }
        if (text.startsWith("/")) {
            const result = handleCommand(text, {
                setCurrentModel,
                availableModels,
                currentModel,
                refreshBalance,
                togglePanel: (name) => {
                    if (name === "todo") setShowTodoPanel((v) => !v);
                    else if (name === "tasks") setShowTasksPanel((v) => !v);
                    else if (name === "model") setShowModelPanel((v) => !v);
                },
                pauseInstance: () => inst.pause(),
                resumeInstance: () => inst.resume(),
                queueItems: () => [...inst.board.queueItems],
                queueAdd: (p) => inst.board.addToQueue(p),
                queueDel: (i) => inst.board.removeFromQueue(i),
                queueClear: () => inst.board.clearQueue(),
                taskList: () => {
                    const tasks = inst.taskManager.list();
                    return tasks.length === 0
                        ? ""
                        : tasks.map((t) => `${t.id}: ${t.command.slice(0, 60)} [${t.status}]`).join(" | ");
                },
                setReasoningEffort: (e) => {
                    inst.reasoningEffort = e;
                },
                getReasoningEffort: () => inst.reasoningEffort,
            });
            if (result === "[clear]") {
                setMessages([{ role: "system", content: inst.manifest.systemPrompt } as SystemMessage]);
            }
            if (result) setCommandFeedback(result);
            return;
        }
        inst.send(text);
    }, [inputValue, availableModels, currentModel, refreshBalance, inst]);

    useInput((input, key) => {
        if (key.ctrl) {
            if (input === "u" || input === "U") {
                setInputValue("");
                setCursorPos(0);
                return;
            }
            if (input === "r" || input === "R") return setReasoningExpanded((v) => !v);
            if (input === "s" || input === "S") return setSystemExpanded((v) => !v);
            if (input === "c" || input === "C") {
                if (ctrlCPressed.current) {
                    getProviderForModel(currentModel).getBalance().then((b) => {
                        setBalance(b);
                        return b;
                    }).catch(() => null).then(() => {
                        printSummary(
                            currentModel,
                            stats,
                            messages,
                            startBalanceRef.current,
                            balance?.balance_infos[0]?.total_balance ?? null,
                        );
                        inst.terminate();
                        timerManager.cleanup();
                        inst.taskManager.cleanup().then(() => Deno.exit(0));
                    });
                    return;
                }
                ctrlCPressed.current = true;
                setTimeout(() => {
                    ctrlCPressed.current = false;
                }, 1000);
                return;
            }
            return;
        }
        if (key.return) {
            if (key.shift || key.meta) {
                setInputValue((v) => v.slice(0, cursorPos) + "\n" + v.slice(cursorPos));
                setCursorPos((c) => c + 1);
                return;
            }
            return handleSubmit();
        }
        // Cursor movement
        if (key.leftArrow) return setCursorPos((c) => Math.max(0, c - 1));
        if (key.rightArrow) return setCursorPos((c) => Math.min(inputValue.length, c + 1));
        if (key.home) return setCursorPos(0);
        if (key.end) return setCursorPos(inputValue.length);
        // Delete at cursor
        if (key.backspace) {
            if (cursorPos <= 0) return;
            setInputValue((v) => v.slice(0, cursorPos - 1) + v.slice(cursorPos));
            setCursorPos((c) => c - 1);
            return;
        }
        if (key.delete) {
            if (cursorPos >= inputValue.length) return;
            setInputValue((v) => v.slice(0, cursorPos) + v.slice(cursorPos + 1));
            return;
        }
        // Insert at cursor
        if (input && !key.meta) {
            setInputValue((v) => v.slice(0, cursorPos) + input + v.slice(cursorPos));
            setCursorPos((c) => c + input.length);
            return;
        }
    });

    const toolResults = useMemo(() => {
        const m = new Map<string, ToolMessage>();
        for (const msg of messages) if (msg.role === "tool") m.set(msg.tool_call_id, msg);
        return m;
    }, [messages]);
    const completedMessages = useMemo(() => {
        const filtered = messages.filter((m) => m.role !== "tool");
        return filtered.length > Config.ui.maxDisplayMessages
            ? filtered.slice(-Config.ui.maxDisplayMessages)
            : filtered;
    }, [messages]);

    return (
        <Box flexDirection="column">
            <Box flexDirection="column" paddingY={1}>
                {showModelPanel && (
                    <ModelPanel
                        models={availableModels}
                        current={currentModel}
                        onSelect={setCurrentModel}
                        onClose={() => setShowModelPanel(false)}
                    />
                )}
                {errorMsg
                    ? (
                        <Box marginY={1}>
                            <Text color="red">{errorMsg}</Text>
                        </Box>
                    )
                    : null}
                <Box flexDirection="column" marginY={1}>
                    <MessageArea
                        completedMessages={completedMessages}
                        toolResults={toolResults}
                        reasoningExpanded={reasoningExpanded}
                        systemExpanded={systemExpanded}
                        kind={inst.manifest.kind}
                    />
                    {turnTokens.output > 0 && status === "idle"
                        ? <Text dimColor>↓ {formatTokens(turnTokens.output)} · {turnDuration.toFixed(1)}s</Text>
                        : null}
                    <StreamingLine
                        text={streamingText}
                        reasoning={streamingReasoning}
                        toolBuf={new Map(
                            toolCallBuf.map((tc, i) => [i, { id: tc.id, type: "function", function: tc.function }]),
                        )}
                        status={status}
                    />
                </Box>
                {showTodoPanel ? <TodoPanel board={inst.board} onClose={() => setShowTodoPanel(false)} /> : null}
                {showTasksPanel
                    ? <TasksPanel taskManager={inst.taskManager} onClose={() => setShowTasksPanel(false)} />
                    : null}
                {commandFeedback ? <Text color="cyan">{commandFeedback}</Text> : null}
                {commandSuggestions.length > 0 ? <Text dimColor>{commandSuggestions.join("  |  ")}</Text> : null}
                <HDivider />
                <InputBar value={inputValue} cursorPos={cursorPos} onSubmit={handleSubmit} />
                {inst.status === "paused"
                    ? <Text color="yellow">⏸ 会话已暂停。输入 /session resume 恢复。</Text>
                    : null}
                <HDivider />
                <StatusBar
                    key={statsTick}
                    model={currentModel}
                    stats={stats}
                    status={status}
                    thinkingMode
                    taskManager={inst.taskManager}
                    turnTokens={turnTokens}
                    paused={inst.status === "paused"}
                    todoCount={inst.board.todoCount}
                    todoDone={inst.board.todoDone}
                    balance={balance}
                    balanceTime={balanceTime}
                    balanceError={balanceError}
                    reasoningEffort={inst.reasoningEffort}
                />
            </Box>
        </Box>
    );
}

export function MainApp(props: { instance?: AgentInstance }) {
    const [selIdx, setSelIdx] = useState(0);
    const [inst, setInst] = useState<AgentInstance | null>(props.instance ?? null);

    useInput((_input, key) => {
        if (inst) return;
        if (key.upArrow) setSelIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) setSelIdx((i) => Math.min(agentRegistry.length - 1, i + 1));
        if (key.return && agentRegistry[selIdx]) {
            const m = agentRegistry[selIdx];
            const i = launch({
                name: m.kind,
                kind: m.kind,
                agentsMd: loadAgentsMd(),
                toolHints: detectAvailableTools(),
            });
            setInst(i);
        }
    });

    if (inst) return <App instance={inst} />;

    return (
        <Box flexDirection="column" paddingY={1}>
            <Text bold color="cyan">⬦ Agents</Text>
            <Box marginY={1}>
                <AgentSelector
                    agents={[...agentRegistry]}
                    selectedIdx={selIdx}
                    onSelect={(id) => {
                        const m = getAgent(id as AgentManifest["kind"]);
                        if (m) {
                            const i = launch({
                                name: m.kind,
                                kind: m.kind,
                                agentsMd: loadAgentsMd(),
                                toolHints: detectAvailableTools(),
                            });
                            setInst(i);
                        }
                    }}
                />
            </Box>
        </Box>
    );
}
