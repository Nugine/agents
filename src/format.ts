// ============================================================================
// Pure formatting functions — no side effects, no I/O, no React.
// ============================================================================

import { Config } from "./config.ts";
import type { SessionStats } from "./types.ts";

/** "3m 12s" | "1h 5m 30s" | "45s" */
export function formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

/** "14:32:05" (HH:mm:ss, 24-hour). */
export function formatTime(date: Date): string {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const s = date.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
}

/** Compact token count: "1.2k" | "3.5M" | raw digits when below 1k. */
export function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
}

export function currencySymbol(price: { currency: string }): string {
    return price.currency === "CNY" ? "¥" : "$";
}

/** Short cost string for the status bar. */
export function calcRealTimeCost(model: string, stats: SessionStats): string {
    const price = Config.pricing[model];
    if (!price) return "--";
    // Cache-hit vs cache-miss calculated separately for auditability.
    // prompt_tokens = cache_hit + cache_miss for each call; the sum holds.
    const cacheHitTokens = stats.totalCacheHitTokens;
    const cacheMissTokens = Math.max(0, stats.totalInputTokens - cacheHitTokens);
    const cacheHitCost = (cacheHitTokens / 1_000_000) * price.cacheHit;
    const cacheMissCost = (cacheMissTokens / 1_000_000) * price.input;
    const outputCost = (stats.totalOutputTokens / 1_000_000) * price.output;
    const total = cacheHitCost + cacheMissCost + outputCost;
    const sym = currencySymbol(price);
    if (total < 0.01) return `${sym}${total.toFixed(4)}`;
    return `${sym}${total.toFixed(2)}`;
}

/** Detailed cost breakdown with cache separation. */
export function calcCostBreakdown(model: string, stats: SessionStats): string {
    const price = Config.pricing[model];
    if (!price) return "--";
    const hit = stats.totalCacheHitTokens;
    const miss = Math.max(0, stats.totalInputTokens - hit);
    const sym = currencySymbol(price);
    const hitCost = (hit / 1_000_000) * price.cacheHit;
    const missCost = (miss / 1_000_000) * price.input;
    const outCost = (stats.totalOutputTokens / 1_000_000) * price.output;
    const total = hitCost + missCost + outCost;
    return `${sym}${total.toFixed(4)} (⊕ ${sym}${hitCost.toFixed(4)})`;
}

/** Context-window fill ratio (0…1). */
export function contextUsageRatio(inputTokens: number, maxTokens: number): number {
    return inputTokens / maxTokens;
}

/**
 * Cache-hit ratio derived from the session counters.
 * Returns a percentage string ("73%") or "--" when no cache-able tokens
 * have been processed yet.
 */
export function calcCacheHitRate(stats: SessionStats): string {
    const total = stats.totalCacheHitTokens + stats.totalCacheMissTokens;
    if (total === 0) return "--";
    return `${((stats.totalCacheHitTokens / total) * 100).toFixed(0)}%`;
}

/**
 * Session cost estimate (used in the exit summary).
 * Uses the pricing table from Config; returns "N/A" for unknown models.
 */
export function calcCost(model: string, stats: SessionStats): string {
    const price = Config.pricing[model];
    if (!price) return "N/A";

    const inputCost = (stats.totalInputTokens / 1_000_000) * price.input;
    const outputCost = (stats.totalOutputTokens / 1_000_000) * price.output;
    const cacheSavings = (stats.totalCacheHitTokens / 1_000_000) * (price.input - price.cacheHit);
    const total = inputCost + outputCost - cacheSavings;

    const sym = currencySymbol(price);
    if (total < 0.01) return `${sym}${total.toFixed(4)}`;
    return `${sym}${total.toFixed(2)}`;
}

/**
 * Print a formatted session summary to stdout.
 * Called on exit (Ctrl+C).  Bypasses the Ink renderer entirely.
 */
export function printSummary(
    model: string,
    stats: SessionStats,
    messages: { role: string }[],
    startBalance?: string | null,
    endBalance?: string | null,
): void {
    const duration = Date.now() - stats.startedAt;
    const msgCounts = { system: 0, user: 0, assistant: 0, tool: 0 };
    for (const m of messages) {
        const role = m.role as keyof typeof msgCounts;
        if (role in msgCounts) msgCounts[role]++;
    }

    const lines = [
        "",
        "═".repeat(50),
        "  Agent Session Summary",
        "─".repeat(50),
        `  模型:         ${model}`,
        `  持续:         ${formatDuration(duration)}`,
        `  消息:         ${messages.length} (sys:${msgCounts.system} usr:${msgCounts.user} ast:${msgCounts.assistant} tool:${msgCounts.tool})`,
        `  工具调用:     ${stats.toolCallCount} 次 bash (bypass)`,
        `  API 调用:     ${stats.apiCallCount} 次`,
        "  Token:",
        `    ↑ 输入:       ${stats.totalInputTokens.toLocaleString()}`,
        `    ⊕ 缓存命中:   ${stats.totalCacheHitTokens.toLocaleString()} (${calcCacheHitRate(stats)})`,
        `    ⊖ 缓存未命中: ${stats.totalCacheMissTokens.toLocaleString()}`,
        `    ↓ 输出:       ${stats.totalOutputTokens.toLocaleString()} (推理: ${stats.totalReasoningTokens.toLocaleString()})`,
        `    合计:       ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()}`,
        `  费用:         ${calcCost(model, stats)}`,
        (startBalance || endBalance)
            ? `  余额:         启动 ¥${startBalance ?? "--"} → 退出 ¥${endBalance ?? "--"}`
            : null,
        "─".repeat(50),
        "═".repeat(50),
        "",
    ];
    console.log(lines.join("\n"));
}
