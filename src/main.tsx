// ============================================================================
// Launcher — TUI (interactive) or oneshot (piped stdin).
// ============================================================================

import { render } from "ink";
import { detectAvailableTools } from "./tools/detect.ts";
import { checkApiKey, loadAgentsMd } from "./transport.ts";
import { MainApp } from "./ui/mod.ts";
import { launch } from "./runtime/mod.ts";
import type { AgentKind } from "./types.ts";

const ONESHOT_PROMPT = `You are a command-line assistant running in oneshot mode.
You receive a task via stdin, execute it using your tools, and output only the final result to stdout.

Rules:
- Be concise. Output ONLY the answer — no greetings, no explanations unless asked.
- Execute side effects (bash commands) when needed — run, don't ask.
- If the task requires multiple steps, do them all and output the final result.
- If a step fails, explain the error briefly and suggest a fix.
- You may use tools to read/write files, run commands, fetch data.`;

export function launchAgent(opts?: { kind?: AgentKind; name?: string }): void {
    checkApiKey();
    if (opts?.kind) {
        const inst = launch({
            name: opts.name ?? "main",
            kind: opts.kind,
            agentsMd: loadAgentsMd(),
            toolHints: detectAvailableTools(),
        });
        render(<MainApp instance={inst} />);
    } else {
        render(<MainApp />);
    }
}

async function oneshot(): Promise<void> {
    checkApiKey();
    const input = await Deno.readTextFile("/dev/stdin");
    if (!input.trim()) {
        console.error("no input on stdin");
        Deno.exit(1);
    }
    const inst = launch({
        name: "oneshot",
        kind: "minion",
        systemPrompt: ONESHOT_PROMPT,
        agentsMd: loadAgentsMd(),
        toolHints: detectAvailableTools(),
    });
    inst.send(input.trim());
    for await (const ev of inst.run(() => {})) {
        if (ev.type === "response") await Deno.stdout.write(new TextEncoder().encode(ev.message.content ?? ""));
        if (ev.type === "error") {
            await Deno.stderr.write(new TextEncoder().encode(ev.message + "\n"));
            Deno.exit(1);
        }
        if (ev.type === "terminated") break;
    }
}

if (import.meta.main) {
    const stat = await Deno.stat("/dev/stdin").catch(() => null);
    if (stat && stat.size > 0) await oneshot();
    else launchAgent();
}
