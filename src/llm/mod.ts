// ============================================================================
// LLM Provider abstraction — multi-provider support.
// ============================================================================

import type { BalanceInfo, Message, ModelInfo } from "../types.ts";

export interface LlmProvider {
    readonly name: string;
    readonly baseUrl: string;
    listModels(): Promise<ModelInfo[]>;
    getBalance(): Promise<BalanceInfo>;
    chatCompletions(
        model: string,
        messages: Message[],
        tools: Array<Record<string, unknown>>,
        reasoningEffort?: string,
        signal?: AbortSignal,
    ): AsyncGenerator<Record<string, unknown>>;
}
