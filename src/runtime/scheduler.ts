// ============================================================================
// Instance Scheduler — manages multiple AgentInstances.
// ============================================================================

import { AgentInstance } from "./instance.ts";
import type { LaunchOptions, SessionStats } from "../types.ts";
import { createEmptyStats } from "../types.ts";

const instances = new Map<string, AgentInstance>();

/** Shared session stats — main and sub-agents both write to this accumulator. */
export const sessionStats: SessionStats = createEmptyStats();

function randomId(): string {
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function launch(opts: LaunchOptions): AgentInstance {
    let id: string;
    do {
        id = randomId();
    } while (instances.has(id));
    const inst = new AgentInstance(opts, id);
    instances.set(inst.id, inst);
    // Auto-start sub-agents in the background
    if (opts.autoTerminate) {
        (async () => {
            let inflight = false;
            try {
                for await (const ev of inst.run(() => {})) {
                    if (ev.type === "thinking" && !inflight) {
                        inflight = true;
                        sessionStats.inFlightCalls++;
                    }
                    if (ev.type === "tool_calls" || ev.type === "response") {
                        if (inflight) {
                            inflight = false;
                            sessionStats.inFlightCalls = Math.max(0, sessionStats.inFlightCalls - 1);
                        }
                    }
                    if (ev.type === "tool_results" || ev.type === "response") {
                        sessionStats.totalInputTokens += ev.inputTokens ?? 0;
                        sessionStats.totalOutputTokens += ev.outputTokens ?? 0;
                        sessionStats.totalCacheHitTokens += ev.cacheHitTokens ?? 0;
                        sessionStats.totalCacheMissTokens += ev.cacheMissTokens ?? 0;
                        sessionStats.totalReasoningTokens += ev.reasoningTokens ?? 0;
                        sessionStats.apiCallCount += 1;
                        sessionStats.currentContextTokens = ev.inputTokens ?? sessionStats.currentContextTokens;
                    }
                    if (ev.type === "tool_results") {
                        sessionStats.toolCallCount += ev.results.length;
                    }
                }
            } catch (_err) {
                // Sub-agent crashed — ensure it's cleaned up
                inst.terminate();
            }
        })();
    }
    return inst;
}

export function get(id: string): AgentInstance | undefined {
    return instances.get(id);
}

/** Remove a terminated instance from the registry. Called automatically by AgentInstance.terminate(). */
export function unregister(id: string): void {
    instances.delete(id);
}

export function list(): AgentInstance[] {
    return [...instances.values()];
}

export function waitFor(id: string, timeoutMs = 300_000): Promise<string> {
    const inst = instances.get(id);
    if (!inst) return Promise.resolve("agent not found");
    return Promise.race([
        inst.completionPromise,
        new Promise<string>((resolve) => setTimeout(() => resolve("join timed out"), timeoutMs)),
    ]);
}

export function terminateAll(): void {
    for (const inst of instances.values()) inst.terminate();
    instances.clear();
}
