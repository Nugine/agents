// ============================================================================
// Transport — thin wrappers for startup setup and LLM provider access.
// ============================================================================

import { loadSync } from "@std/dotenv";
import { Config } from "./config.ts";
import { DeepSeekProvider } from "./llm/deepseek.ts";
import type { LlmProvider } from "./llm/mod.ts";

// ---- API key bootstrapping --------------------------------------------------

export function checkApiKey(): void {
    if (Config.api.key) return;
    try {
        const env = loadSync({ envPath: ".env" });
        if (env.DEEPSEEK_API_KEY) {
            Deno.env.set("DEEPSEEK_API_KEY", env.DEEPSEEK_API_KEY);
            return;
        }
    } catch { /* fall through */ }
    throw new Error("DEEPSEEK_API_KEY is not set.\nSet it in .env file or export as environment variable.");
}

// ---- LLM provider -----------------------------------------------------------

import { MiMoProvider } from "./llm/mimo.ts";

let _providers: Map<string, LlmProvider> | null = null;

function initProviders(): Map<string, LlmProvider> {
    if (_providers) return _providers;
    _providers = new Map();
    if (Deno.env.get("DEEPSEEK_API_KEY")) {
        _providers.set("deepseek", new DeepSeekProvider(Deno.env.get("DEEPSEEK_API_KEY")!));
    }
    if (Deno.env.get("MIMO_API_KEY")) _providers.set("mimo", new MiMoProvider(Deno.env.get("MIMO_API_KEY")!));
    return _providers;
}

export function getProvider(name?: string): LlmProvider {
    const providers = initProviders();
    if (name) return providers.get(name) ?? providers.values().next().value!;
    return providers.values().next().value!;
}

export function resolveModelTier(tier: "light" | "medium" | "heavy"): string {
    const providers = initProviders();
    const candidates = Config.model.tiers[tier];
    for (const modelId of candidates) {
        const providerName = modelId.startsWith("mimo") ? "mimo" : "deepseek";
        if (providers.has(providerName)) return modelId;
    }
    return candidates[0]; // fallback
}

export function getProviderForModel(modelId: string): LlmProvider {
    const providers = initProviders();
    // Match model to provider by prefix
    if (modelId.startsWith("mimo")) return providers.get("mimo") ?? providers.values().next().value!;
    return providers.get("deepseek") ?? providers.values().next().value!;
}

export function defaultModels() {
    const models = [];
    if (Deno.env.get("DEEPSEEK_API_KEY")) {
        models.push({ id: "deepseek-v4-flash", provider: "deepseek" });
        models.push({ id: "deepseek-v4-pro", provider: "deepseek" });
    }
    if (Deno.env.get("MIMO_API_KEY")) {
        models.push({ id: "mimo-v2.5-pro", provider: "mimo" });
        models.push({ id: "mimo-v2.5", provider: "mimo" });
    }
    return models;
}

// ---- Utility ----------------------------------------------------------------

export function loadAgentsMd(): string {
    try {
        return Deno.readTextFileSync("./AGENTS.md");
    } catch {
        return "";
    }
}

const _startBalance = { value: null as string | null };
export function getStartBalance(): string | null {
    return _startBalance.value;
}
export function setStartBalance(v: string) {
    if (!_startBalance.value) _startBalance.value = v;
}

export function filterTools(enabledNames: string[]): Array<Record<string, unknown>> {
    const set = new Set(enabledNames);
    return Config.tools.filter((t: { function: { name: string } }) => set.has(t.function.name));
}
