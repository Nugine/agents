// ============================================================================
// Code executor — multi-language code execution for CodeAct agents.
// ============================================================================
// Supports python3, bash, and deno-eval.  All run with a 60s timeout and
// 8K output truncation, consistent with the bash tool.
// ============================================================================

import { Config } from "../config.ts";
import type { BashArgs, BashExecResult } from "../types.ts";
import { decodeUtf8, TaskManager, truncate } from "./tasks.ts";

export type CodeLang = "python" | "bash" | "typescript";

export interface CodeResult {
    exit_code: number;
    stdout: string;
    stderr: string;
}

/** Build the shell command for a given language + code string. */
function buildCommand(lang: CodeLang, code: string): { cmd: string; args: string[] } {
    switch (lang) {
        case "python":
            return { cmd: "python3", args: ["-c", code] };
        case "typescript":
            return { cmd: "deno", args: ["eval", "--no-check", code] };
        case "bash":
        default:
            return { cmd: "bash", args: ["-c", code] };
    }
}

/** Execute a code snippet in the given language. */
export async function executeCode(lang: CodeLang, code: string): Promise<CodeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Config.bash.fgTimeoutMs);

    try {
        const { cmd, args } = buildCommand(lang, code);
        const proc = new Deno.Command(cmd, {
            args,
            stdout: "piped",
            stderr: "piped",
            signal: controller.signal,
        }).spawn();

        const { code: exitCode, stdout, stderr } = await proc.output();

        return {
            exit_code: exitCode,
            stdout: truncate(decodeUtf8(stdout), Config.bash.outputMaxChars),
            stderr: truncate(decodeUtf8(stderr), Config.bash.outputMaxChars),
        };
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            return {
                exit_code: -1,
                stdout: "",
                stderr: `Execution timed out after ${Config.bash.fgTimeoutMs / 1000}s`,
            };
        }
        return {
            exit_code: -1,
            stdout: "",
            stderr: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        };
    } finally {
        clearTimeout(timer);
    }
}

/** Execute code in background via TaskManager. Reuses bash_input/bash_output for I/O. */
export async function executeCodeBg(lang: CodeLang, code: string, tm: TaskManager): Promise<BashExecResult> {
    const { cmd, args } = buildCommand(lang, code);
    const quoted = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
    const command = `${cmd} ${quoted}`;
    const { result } = await tm.spawn({ command, background: true } as BashArgs);
    return result;
}
