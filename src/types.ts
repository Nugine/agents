// ============================================================================
// Domain types for the conversational agent platform.
// ============================================================================
// All interfaces and type aliases needed across module boundaries live here.
// Shapes are aligned with the OpenAI-compatible ChatCompletion API schema
// so that transport-layer serialization and tool execution can share them
// without duplication.
// ============================================================================

// ---- Message types ----------------------------------------------------------

/** OpenAI-compatible role discriminator. */
export type Role = "system" | "user" | "assistant" | "tool";

export interface SystemMessage {
    role: "system";
    content: string;
}

export interface UserMessage {
    role: "user";
    content: string;
}

/** A tool call issued by the model in a streaming delta or final response. */
export interface ToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

export interface AssistantMessage {
    role: "assistant";
    /** Null when the message carries only tool calls or reasoning. */
    content: string | null;
    /** Present only when the model is in thinking mode. */
    reasoning_content?: string | null;
    tool_calls?: ToolCall[];
}

/** Carries the serialised result of a tool execution back to the model. */
export interface ToolMessage {
    role: "tool";
    /** JSON-encoded tool result. */
    content: string;
    /** Must match the `id` of the originating ToolCall. */
    tool_call_id: string;
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ---- Agent manifest ---------------------------------------------------------

export type AgentKind = "minion" | "spark" | "firefly";

/** Static descriptor for an agent known to the platform. */
export interface AgentManifest {
    kind: AgentKind;
    /** Display title rendered in the TUI header. */
    title: string;
    /** One-line description shown in the agent selection screen. */
    description: string;
    /** System prompt injected at the start of every conversation. */
    systemPrompt: string;
    /** Model tier preference: light, medium, heavy. Resolved at launch. */
    modelTier: "light" | "medium" | "heavy";
    /** Tools to exclude from the default all-tools set. */
    disableTools?: string[];
}

// ---- Tool types -------------------------------------------------------------

/** Arguments the model passes when calling the bash tool. */
export interface BashArgs {
    command: string;
    /** Optional content piped to the process stdin. */
    stdin?: string | null;
    /** Max chars for inline preview (default 500). */
    preview_chars?: number;
    /** Set to true to return full output (up to 8000 chars). */
    verbose?: boolean;
    /** Skip foreground wait — run directly in background. */
    background?: boolean;
    /** Working directory for the command (default: current workspace). */
    cwd?: string;
}

/** Normalized result of a bash command execution. */
export interface BashResult {
    exit_code: number;
    stdout: string;
    stderr: string;
}

/** Extended result including background-task metadata. */
export interface BashExecResult extends BashResult {
    status: BashExecStatus;
    task_id?: string;
    stdout_size?: number;
    stdout_file?: string;
    stderr_size?: number;
    stderr_file?: string;
}

export type BashExecStatus = "completed" | "backgrounded" | "timed_out" | "error";

// ---- Background task --------------------------------------------------------

export type BgTaskStatus = "running" | "completed" | "timed_out" | "error";

export interface BgTask {
    id: string;
    command: string;
    status: BgTaskStatus;
    startedAt: number;
    finishedAt?: number;
    exitCode?: number;
    stdoutPreview?: string;
    stdoutFile?: string;
    stderrPreview?: string;
    stderrFile?: string;
}

// ---- API types --------------------------------------------------------------

export interface ModelInfo {
    id: string;
    provider: string;
}

/** Token usage counters returned by the API (per-request). */
export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
}

export interface BalanceInfo {
    is_available: boolean;
    balance_infos: Array<{
        currency: string;
        total_balance: string;
        granted_balance: string;
        topped_up_balance: string;
    }>;
}

// ---- Session state ----------------------------------------------------------

/** Accumulated counters for the current session (resets on restart). */
export interface SessionStats {
    /** `Date.now()` at session start, used for elapsed-time display. */
    startedAt: number;
    /** Accumulated prompt tokens across all calls (for cost calculation). */
    totalInputTokens: number;
    /** Accumulated completion tokens across all calls (for cost calculation). */
    totalOutputTokens: number;
    /** Latest API call's prompt_tokens — the current context size. */
    currentContextTokens: number;
    totalCacheHitTokens: number;
    totalCacheMissTokens: number;
    /** Tokens consumed by the model's internal reasoning chain. */
    totalReasoningTokens: number;
    toolCallCount: number;
    apiCallCount: number;
    inFlightCalls: number;
}

// ---- Streaming state --------------------------------------------------------

/**
 * A tool call being assembled incrementally across SSE chunks.
 * The `function.arguments` string is concatenated chunk-by-chunk
 * and parsed only after `finish_reason` arrives.
 */
export interface AccumulatingToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

/** High-level lifecycle state of the agent UI. */
export type AppStatus = "idle" | "thinking" | "tool_running" | "error";

/** The complete result of one streaming API call + in-memory accumulation. */
export interface StreamResult {
    finishReason: "stop" | "tool_calls" | "length" | "content_filter" | "error";
    content: string | null;
    reasoning: string;
    toolCalls: ToolCall[];
    usage: TokenUsage | null;
}

// ---- Sub-agent options ------------------------------------------------------

export interface SubAgentOptions {
    model?: string;
    reasoningEffort?: string;
}

// ---- Agent messaging --------------------------------------------------------

export interface AgentMessage {
    from: string;
    to: string;
    content: string;
    timestamp: number;
}

// ---- Agent instance events --------------------------------------------------

export type AgentEvent =
    | { type: "thinking"; text: string; reasoning: string }
    | { type: "tool_calls"; calls: ToolCall[] }
    | {
        type: "tool_results";
        results: ToolMessage[];
        inputTokens?: number;
        outputTokens?: number;
        cacheHitTokens?: number;
        cacheMissTokens?: number;
        reasoningTokens?: number;
    }
    | {
        type: "response";
        message: AssistantMessage;
        inputTokens?: number;
        outputTokens?: number;
        cacheHitTokens?: number;
        cacheMissTokens?: number;
        reasoningTokens?: number;
    }
    | { type: "error"; message: string }
    | { type: "idle" }
    | { type: "paused" }
    | { type: "terminated" }
    | { type: "user_message"; text: string };

export interface LaunchOptions {
    name: string;
    kind?: AgentKind;
    modelTier?: "light" | "medium" | "heavy";
    model?: string;
    systemPrompt?: string;
    agentsMd?: string;
    toolHints?: string;
    autoTerminate?: boolean;
}

// ---- Factory ----------------------------------------------------------------

/** Return a zeroed SessionStats with `startedAt` set to now. */
export function createEmptyStats(): SessionStats {
    return {
        startedAt: Date.now(),
        totalInputTokens: 0,
        totalOutputTokens: 0,
        currentContextTokens: 0,
        totalCacheHitTokens: 0,
        totalCacheMissTokens: 0,
        totalReasoningTokens: 0,
        toolCallCount: 0,
        apiCallCount: 0,
        inFlightCalls: 0,
    };
}
