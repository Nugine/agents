// ============================================================================
// DeepSeek V4 provider implementation.
// ============================================================================

import type { BalanceInfo, Message, ModelInfo } from "../types.ts";
import type { LlmProvider } from "./mod.ts";

function authHeader(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
}

export class DeepSeekProvider implements LlmProvider {
    readonly name = "deepseek";
    readonly baseUrl = "https://api.deepseek.com";
    #apiKey: string;

    constructor(apiKey: string) {
        this.#apiKey = apiKey;
    }

    async listModels(): Promise<ModelInfo[]> {
        const res = await fetch(`${this.baseUrl}/v1/models`, { headers: authHeader(this.#apiKey) });
        if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
        const data = await res.json();
        const models = (data.data ?? []) as ModelInfo[];
        return models;
    }

    async getBalance(): Promise<BalanceInfo> {
        const res = await fetch(`${this.baseUrl}/user/balance`, { headers: authHeader(this.#apiKey) });
        if (!res.ok) throw new Error(`Failed to fetch balance: ${res.status}`);
        return res.json() as Promise<BalanceInfo>;
    }

    async *chatCompletions(
        model: string,
        messages: Message[],
        tools: Array<Record<string, unknown>>,
        reasoningEffort?: string,
        signal?: AbortSignal,
    ): AsyncGenerator<Record<string, unknown>> {
        const body = JSON.stringify({
            model,
            stream: true,
            stream_options: { include_usage: true },
            tools,
            messages,
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        });
        const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader(this.#apiKey) },
            body,
            signal,
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`API error ${res.status}: ${errText.slice(0, 500)}`);
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data: ")) continue;
                const payload = trimmed.slice(6);
                if (payload === "[DONE]") return;
                try {
                    yield JSON.parse(payload) as Record<string, unknown>;
                } catch { /* skip malformed */ }
            }
        }
    }
}
