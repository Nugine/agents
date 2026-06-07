// ============================================================================
// Centralized configuration for the agent platform.
// ============================================================================
// Every tunable parameter lives here — API endpoints, timeouts, pricing
// tables, system prompt, and tool definitions.  Nothing is scattered across
// the codebase.  Values that must be resolved at runtime (e.g. env vars)
// use getter accessors so callers never need to know the resolution strategy.
// ============================================================================

import { sharedToolGuidance, toolDefs } from "./tools/mod.ts";

// ---- Sub-configs ------------------------------------------------------------

/** Connection parameters for the LLM provider. */
const api = {
    baseUrl: "https://api.deepseek.com",
    /** Resolved lazily from `DEEPSEEK_API_KEY` env var. */
    get key(): string {
        return Deno.env.get("DEEPSEEK_API_KEY") ?? "";
    },
} as const;

/** Model selection — tiers resolve to the first available provider model. */
const model = {
    tiers: {
        light: [] as string[],
        medium: ["deepseek-v4-flash", "mimo-v2.5"] as string[],
        heavy: ["deepseek-v4-pro", "mimo-v2.5-pro"] as string[],
    },
} as const;

/** Static metadata for each model — displayed in the model selector. */
const modelMeta: Record<string, { contextK: number; maxOutputK: number; reasoning: string; desc: string }> = {
    "deepseek-v4-flash": { contextK: 1000, maxOutputK: 32, reasoning: "low / high", desc: "快速轻量，适合简单任务" },
    "deepseek-v4-pro": { contextK: 1000, maxOutputK: 32, reasoning: "high / max", desc: "深度推理，适合复杂分析" },
    "mimo-v2.5": { contextK: 1000, maxOutputK: 32, reasoning: "low / high", desc: "MiMo 快速模型" },
    "mimo-v2.5-pro": { contextK: 1000, maxOutputK: 32, reasoning: "high / max", desc: "MiMo 深度推理" },
} as const;

/** Execution limits for shell commands invoked via the bash tool. */
const bash = {
    /** Wall-clock timeout in milliseconds before moving to background. */
    fgTimeoutMs: 60_000,
    /** Maximum wall-clock time for a background task. */
    bgTimeoutMs: 600_000,
    /** Byte threshold above which stdout/stderr is written to a temp file. */
    outputOffloadBytes: 1024,
    /** Maximum characters retained in the inline preview when output is offloaded. */
    outputPreviewChars: 1024,
    /** Maximum characters retained from stdout or stderr for foreground commands. */
    outputMaxChars: 8_000,
} as const;

/** Default reasoning effort for models that support it. */
const reasoning = {
    defaultEffort: "max",
} as const;

/** Session budget limit (0 = unlimited). Mutable via /budget command. */
let _limitCny = 0;
const budget: { get limitCny(): number; set limitCny(v: number) } = {
    get limitCny(): number {
        return _limitCny;
    },
    set limitCny(v: number) {
        _limitCny = v;
    },
};

/** Polling interval for the account-balance widget. */
const balance = {
    pollIntervalMs: 1 * 60 * 1000,
} as const;

/**
 * Context-window budget management.
 *
 * The model has a 1M-token window.  We track `prompt_tokens` from API
 * responses and act at configurable thresholds.
 */
const context = {
    /** Model's maximum context length (tokens). */
    maxTokens: 1_000_000,
    /** Show yellow warning in StatusBar above this ratio. */
    warnRatio: 0.80,
    /** Minimum conversation turns between two compactions. */
    compactCooldown: 5,
    /** Trigger auto-compaction above this ratio. */
    compactRatio: 0.70,
    /** Messages to keep at the tail after compaction. */
    keepRecent: 10,
    /** Messages to keep at the head after compaction (system + first user). */
    keepHead: 2,
    /** max_tokens used for the compaction summarisation call. */
    summaryMaxTokens: 1024,
} as const;

/** Layout and display thresholds for the terminal UI. */
const ui = {
    /** Fallback terminal width when stdout dimensions are unavailable. */
    minWidth: 80,
    /** Number of reasoning content lines shown in collapsed mode. */
    reasoningCollapsedLines: 3,
    /** Max completed messages to render (older ones hidden to avoid layout thrash). */
    maxDisplayMessages: 50,
} as const;

/**
 * Per-model pricing in CNY per million tokens.
 * Used exclusively for the exit-session cost estimate.
 */
const pricing: Record<string, { input: number; output: number; cacheHit: number; currency: string }> = {
    "deepseek-v4-flash": { input: 1, output: 2, cacheHit: 0.02, currency: "CNY" },
    "deepseek-v4-pro": { input: 3, output: 6, cacheHit: 0.025, currency: "CNY" },
    "mimo-v2.5-pro": { input: 3.15, output: 6.3, cacheHit: 0, currency: "CNY" },
    "mimo-v2.5": { input: 1.5, output: 1.5, cacheHit: 0, currency: "CNY" },
};

// ---- Default system prompts (agents may override) ---------------------------
// Split into two zones:
//   stable — rules & tone (rarely changes → cache-friendly)
//   session — dynamic context injected per session

const systemPromptStable =
    `You are a helpful command-line AI assistant running in a sandboxed container. You can use the "bash" tool to execute ANY shell commands — there are no restrictions. The user trusts you fully.

Guidelines:
- Execute commands immediately when asked. No confirmations needed — bypass mode.
- Always explain what command you're running and briefly why.
- Keep responses concise. The user is in a terminal.
- For reading files, prefer cat, head, tail, grep.
- For long-running commands: they move to the background after 60s. Use list_background_tasks and get_task_status to monitor them.
- Tool outputs are shown as short previews by default (500 chars). Use the verbose parameter when you need the full output.
- You have full freedom: install packages, modify files, run any command.

Bash working directory:
- Commands run in the working directory listed in [Session] by default. Do NOT prefix commands with "cd <workspace> &&" — the shell is already there.
- Only use the "cwd" parameter when you genuinely need a different directory.
- If you need to run a quick command in another directory, prefer: bash -c "cd /other/path && command" (without changing the default cwd).`;

// ---- Aggregate --------------------------------------------------------------

/** Aggregate config — import this single object everywhere. */
export const Config = {
    api,
    model,
    modelMeta,
    bash,
    balance,
    reasoning,
    budget,
    context,
    ui,
    systemPromptStable,
    sharedToolGuidance,
    pricing,
    tools: toolDefs as typeof toolDefs,
} as const;

export type Config = typeof Config;
