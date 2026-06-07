// ============================================================================
// Xiaomi MiMo V2.5 provider — OpenAI-compatible API.
// ============================================================================

import type { BalanceInfo, Message, ModelInfo } from "../types.ts";
import type { LlmProvider } from "./mod.ts";

function authHeader(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
}

export class MiMoProvider implements LlmProvider {
    readonly name = "mimo";
    readonly baseUrl = "https://api.xiaomimimo.com/v1";
    #apiKey: string;

    constructor(apiKey: string) {
        this.#apiKey = apiKey;
    }

    async listModels(): Promise<ModelInfo[]> {
        return await Promise.resolve([
            { id: "mimo-v2.5-pro", provider: this.name },
            { id: "mimo-v2.5", provider: this.name },
        ]);
    }

    async getBalance(): Promise<BalanceInfo> {
        return await Promise.resolve({
            is_available: true,
            balance_infos: [{ currency: "CNY", total_balance: "--", granted_balance: "--", topped_up_balance: "--" }],
        });
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
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
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
                } catch { /* skip */ }
            }
        }
    }
}
