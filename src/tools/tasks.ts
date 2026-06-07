import { v7 } from "@std/uuid";
// ============================================================================
// Background task manager — long-running shell commands with streaming I/O.
// ============================================================================

import { Config } from "../config.ts";
import type { BashArgs, BashExecResult, BgTask } from "../types.ts";

// ---- Helpers (exported for testing) ----------------------------------------

export function decodeUtf8(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

let _seq = 0;
export function nextId(uuidProvider?: () => string): string {
    const uuid = uuidProvider ? uuidProvider() : v7.generate();
    return `${uuid.slice(0, 8)}_${(_seq++).toString(36)}`;
}

export function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max / 2) + `\n... [truncated ${text.length - max} chars] ...\n` + text.slice(-max / 2);
}

function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
    }
    return result;
}

// ---- TaskManager -----------------------------------------------------------

interface RunningProc {
    stdoutChunks: Uint8Array[];
    stderrChunks: Uint8Array[];
    stdinWriter: WritableStreamDefaultWriter<Uint8Array> | null;
    statusPromise: Promise<Deno.CommandStatus>;
    resolved: boolean;
    resolveCode: number;
}

export class TaskManager {
    readonly #tasks = new Map<string, BgTask>();
    readonly #running = new Map<string, RunningProc>();
    readonly #controllers = new Map<string, AbortController>();
    readonly #tempDir: string;

    constructor(tempDir: string) {
        this.#tempDir = tempDir;
    }

    get tempDir(): string {
        return this.#tempDir;
    }

    // -- spawn ------------------------------------------------------------------

    async spawn(args: BashArgs): Promise<{ result: BashExecResult; bgTaskId?: string }> {
        const taskId = nextId();
        const controller = new AbortController();

        const cmd = new Deno.Command("bash", {
            args: ["-c", args.command],
            stdin: "piped",
            stdout: "piped",
            stderr: "piped",
            signal: controller.signal,
            ...(args.cwd ? { cwd: args.cwd } : {}),
        });

        const proc = cmd.spawn();
        const stdinWriter = proc.stdin.getWriter();

        if (args.stdin != null) {
            await stdinWriter.write(new TextEncoder().encode(args.stdin));
        }

        this.#startStreaming(taskId, proc, stdinWriter);

        // Background mode — skip foreground wait
        if (args.background) {
            this.#setupBgTask(taskId, args.command, controller);
            return {
                result: {
                    status: "backgrounded",
                    exit_code: -1,
                    stdout: `[background] task_id=${taskId}`,
                    stderr: "",
                    task_id: taskId,
                },
                bgTaskId: taskId,
            };
        }

        // Foreground: race output vs timeout
        const fgTimer = delay(Config.bash.fgTimeoutMs);
        const fgDone = this.#waitForCompletion(taskId);

        const winner = await Promise.race([fgDone.then(() => "done" as const), fgTimer.then(() => "timeout" as const)]);

        if (winner === "done") {
            return { result: this.#buildResult(taskId, "completed") };
        }

        // Move to background
        this.#setupBgTask(taskId, args.command, controller);
        return {
            result: {
                status: "backgrounded",
                exit_code: -1,
                stdout: `[backgrounded] task_id=${taskId}`,
                stderr: "",
                task_id: taskId,
            },
            bgTaskId: taskId,
        };
    }

    /** Send stdin to a running background task. */
    sendStdin(taskId: string, content: string): boolean {
        const r = this.#running.get(taskId);
        if (!r || r.resolved) return false;
        try {
            r.stdinWriter?.write(new TextEncoder().encode(content));
            return true;
        } catch {
            return false;
        }
    }

    /** Kill a running background task by aborting its process. */
    kill(taskId: string): boolean {
        const c = this.#controllers.get(taskId);
        if (!c) return false;
        c.abort();
        return true;
    }

    /** Read accumulated stdout/stderr from a running background task. */
    readOutput(taskId: string): { stdout: string; stderr: string } | null {
        const r = this.#running.get(taskId);
        if (!r) return null;
        return { stdout: decodeUtf8(concatChunks(r.stdoutChunks)), stderr: decodeUtf8(concatChunks(r.stderrChunks)) };
    }

    // -- query ------------------------------------------------------------------

    get(id: string): BgTask | undefined {
        return this.#tasks.get(id);
    }
    list(): BgTask[] {
        return [...this.#tasks.values()];
    }
    activeCount(): number {
        let n = 0;
        for (const t of this.#tasks.values()) if (t.status === "running") n++;
        return n;
    }

    // -- cleanup ----------------------------------------------------------------

    async cleanup(): Promise<void> {
        for (const r of this.#running.values()) {
            try {
                r.stdinWriter?.close();
            } catch { /* ignore */ }
        }
        for (const c of this.#controllers.values()) c.abort();
        this.#controllers.clear();
        this.#tasks.clear();
        this.#running.clear();
        try {
            await Deno.remove(this.#tempDir, { recursive: true });
        } catch { /* best-effort */ }
    }

    // -- internals --------------------------------------------------------------

    #startStreaming(taskId: string, proc: Deno.ChildProcess, stdinWriter: WritableStreamDefaultWriter<Uint8Array>) {
        const rp: RunningProc = {
            stdoutChunks: [],
            stderrChunks: [],
            stdinWriter,
            statusPromise: proc.status,
            resolved: false,
            resolveCode: 0,
        };
        this.#running.set(taskId, rp);
        (async () => {
            const reader = proc.stdout.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    rp.stdoutChunks.push(value);
                }
            } catch { /* closed */ }
        })();
        (async () => {
            const reader = proc.stderr.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    rp.stderrChunks.push(value);
                }
            } catch { /* closed */ }
        })();
    }

    #setupBgTask(taskId: string, command: string, controller: AbortController) {
        const bgTask: BgTask = { id: taskId, command, status: "running", startedAt: Date.now() };
        this.#tasks.set(taskId, bgTask);
        this.#controllers.set(taskId, controller);
        this.#waitForCompletion(taskId).then(() => {
            const t = this.#tasks.get(taskId);
            if (t && t.status === "running") this.#finalizeOutput(taskId, "completed");
            this.#controllers.delete(taskId);
        }).catch((err) => {
            const t = this.#tasks.get(taskId);
            if (!t || t.status !== "running") return;
            if (err instanceof DOMException && err.name === "AbortError") this.#finalizeOutput(taskId, "timed_out");
            else {
                t.status = "error";
                t.finishedAt = Date.now();
                t.exitCode = -1;
            }
            this.#controllers.delete(taskId);
        });
        delay(Config.bash.bgTimeoutMs).then(() => {
            const t = this.#tasks.get(taskId);
            if (t && t.status === "running") controller.abort();
        });
    }

    #waitForCompletion(taskId: string): Promise<void> {
        const rp = this.#running.get(taskId)!;
        return rp.statusPromise.then((s) => {
            rp.resolved = true;
            rp.resolveCode = s.code;
        });
    }

    #finalizeOutput(taskId: string, status: "completed" | "timed_out") {
        const t = this.#tasks.get(taskId)!;
        const rp = this.#running.get(taskId);
        if (!rp) return;
        t.status = status;
        t.finishedAt = Date.now();
        t.exitCode = rp.resolveCode;
        const outText = decodeUtf8(concatChunks(rp.stdoutChunks));
        const errText = decodeUtf8(concatChunks(rp.stderrChunks));
        if (outText.length > Config.bash.outputOffloadBytes) {
            const path = `${this.#tempDir}/${t.id}_stdout.txt`;
            Deno.writeTextFileSync(path, outText);
            t.stdoutFile = path;
            t.stdoutPreview = outText.slice(0, Config.bash.outputPreviewChars);
        } else t.stdoutPreview = outText;
        if (errText.length > Config.bash.outputOffloadBytes) {
            const path = `${this.#tempDir}/${t.id}_stderr.txt`;
            Deno.writeTextFileSync(path, errText);
            t.stderrFile = path;
            t.stderrPreview = errText.slice(0, Config.bash.outputPreviewChars);
        } else t.stderrPreview = errText;
        this.#running.delete(taskId);
    }

    #buildResult(taskId: string, status: "completed"): BashExecResult {
        const rp = this.#running.get(taskId)!;
        const stdout = concatChunks(rp.stdoutChunks);
        const stderr = concatChunks(rp.stderrChunks);
        const outText = truncate(decodeUtf8(stdout), Config.bash.outputMaxChars);
        const errText = truncate(decodeUtf8(stderr), Config.bash.outputMaxChars);
        const result: BashExecResult = {
            status,
            exit_code: rp.resolveCode,
            stdout: outText,
            stderr: errText,
            stdout_size: stdout.length,
            stderr_size: stderr.length,
        };
        if (stdout.length > Config.bash.outputOffloadBytes) {
            const path = `${this.#tempDir}/${taskId}_stdout.txt`;
            Deno.writeTextFileSync(path, decodeUtf8(stdout));
            result.stdout_file = path;
            result.stdout = outText.slice(0, Config.bash.outputPreviewChars);
        }
        if (stderr.length > Config.bash.outputOffloadBytes) {
            const path = `${this.#tempDir}/${taskId}_stderr.txt`;
            Deno.writeTextFileSync(path, decodeUtf8(stderr));
            result.stderr_file = path;
            result.stderr = errText.slice(0, Config.bash.outputPreviewChars);
        }
        this.#running.delete(taskId);
        return result;
    }
}
