// ============================================================================
// Eval — async generator effect system via `yield*`.
// ============================================================================

import { createContext, Script } from "node:vm";
import type { AgentMessage, BashExecResult } from "../types.ts";

const EFFECT = Symbol("eval.effect");

type EvalEffect =
    | { type: "bash"; command: string; stdin?: string; background?: boolean; cwd?: string }
    | { type: "fork"; prompt?: string; name?: string }
    | { type: "spawn"; prompt: string; name?: string; kind?: string }
    | { type: "join"; agentIds: string[] }
    | { type: "send"; to: string; content: string }
    | { type: "recv" }
    | { type: "agents" }
    | { type: "agentId" }
    | { type: "sleep"; seconds: number }
    | { type: "import"; specifier: string };

export interface EvalContext {
    bash: (cmd: string, stdin?: string, background?: boolean, cwd?: string) => Promise<BashExecResult>;
    fork: (opts?: { prompt?: string; name?: string }) => string;
    spawn: (opts: { prompt: string; name?: string; kind?: string }) => string;
    join: (agentIdOrIds: string | string[]) => Promise<string | string[]>;
    send: (to: string, content: string) => void;
    recv: () => AgentMessage[];
    agents: () => string[];
    agentId: () => string;
    sleep: (seconds: number) => Promise<void>;
    import: (specifier: string) => Promise<unknown>;
}

function brand(e: EvalEffect): { __brand: typeof EFFECT; value: EvalEffect } {
    return { __brand: EFFECT, value: e };
}

export async function* runEval(
    code: string,
    ctx: EvalContext,
): AsyncGenerator<{ log?: string; value?: unknown; error?: string }> {
    const logs: string[] = [];

    const $ = {
        bash: async function* (cmd: string, stdin?: string, background?: boolean, cwd?: string) {
            const r: BashExecResult = yield brand({ type: "bash", command: cmd, stdin, background, cwd });
            return r;
        },
        fork: async function* (opts?: { prompt?: string; name?: string }) {
            const r: string = yield brand({ type: "fork", ...opts });
            return r;
        },
        spawn: async function* (opts: { prompt: string; name?: string; kind?: string }) {
            const r: string = yield brand({ type: "spawn", ...opts });
            return r;
        },
        join: async function* (agentIdOrIds: string | string[]) {
            const agentIds = Array.isArray(agentIdOrIds) ? agentIdOrIds : [agentIdOrIds];
            const r: string | string[] = yield brand({ type: "join", agentIds });
            return Array.isArray(agentIdOrIds) ? r : (r as string[])[0];
        },
        send: async function* (to: string, content: string) {
            yield brand({ type: "send", to, content });
        },
        recv: async function* () {
            const r: AgentMessage[] = yield brand({ type: "recv" });
            return r;
        },
        agents: async function* () {
            const r: string[] = yield brand({ type: "agents" });
            return r;
        },
        agentId: async function* () {
            const r: string = yield brand({ type: "agentId" });
            return r;
        },
        sleep: async function* (seconds: number) {
            yield brand({ type: "sleep", seconds });
        },
        import: async function* (specifier: string) {
            const r: unknown = yield brand({ type: "import", specifier });
            return r;
        },
    };

    const sandbox = {
        $,
        console: {
            log: (...args: unknown[]) => {
                logs.push(args.map(String).join(" "));
            },
        },
    };
    const vmContext = createContext(sandbox);
    const wrapped = `(async function*() { ${code} })();`;

    let script: Script;
    try {
        script = new Script(wrapped);
    } catch (err) {
        yield { error: `eval syntax error: ${err instanceof Error ? err.message : String(err)}` };
        return;
    }

    let gen: AsyncGenerator<unknown, unknown, unknown>;
    try {
        gen = script.runInContext(vmContext) as AsyncGenerator<unknown, unknown, unknown>;
    } catch (err) {
        yield { error: `eval compile error: ${err instanceof Error ? err.message : String(err)}` };
        return;
    }

    let next = await gen.next();
    while (!next.done) {
        const raw = next.value as Record<string, unknown> | undefined;
        if (!raw || raw.__brand !== EFFECT) {
            yield { error: "eval code yielded non-effect value" };
            return;
        }
        const result = await executeEffect(raw.value as EvalEffect, ctx);
        next = await gen.next(result);
        if (next.done) break;
    }

    for (const line of logs) yield { log: line };
    yield { value: next.value };
}

async function executeEffect(e: EvalEffect, ctx: EvalContext): Promise<unknown> {
    switch (e.type) {
        case "bash":
            return await ctx.bash(e.command, e.stdin, e.background, e.cwd);
        case "fork":
            return ctx.fork({ prompt: e.prompt, name: e.name });
        case "spawn":
            return ctx.spawn({ prompt: e.prompt!, name: e.name, kind: e.kind });
        case "join":
            return await ctx.join(e.agentIds);
        case "send":
            ctx.send(e.to, e.content);
            return;
        case "recv":
            return ctx.recv();
        case "agents":
            return ctx.agents();
        case "agentId":
            return ctx.agentId();
        case "sleep":
            await ctx.sleep(e.seconds);
            return;
        case "import":
            return await ctx.import(e.specifier);
    }
}
