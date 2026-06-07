// ============================================================================
// Unit tests — pure functions from format, tasks, transport.
// ============================================================================

import { assertEquals } from "jsr:@std/assert@1";
import { parseCommand } from "./commands/parser.ts";
import { accumulateToolCall, type ToolCallBuf } from "./engine.ts";
import {
    calcCacheHitRate,
    calcCost,
    calcRealTimeCost,
    contextUsageRatio,
    formatDuration,
    formatTime,
    formatTokens,
} from "./format.ts";
import { decodeUtf8, nextId, truncate } from "./tools/tasks.ts";
import { filterTools } from "./transport.ts";
import { createEmptyStats } from "./types.ts";
import type { SessionStats } from "./types.ts";

// ---- formatDuration ---------------------------------------------------------

Deno.test("formatDuration — seconds only", () => {
    assertEquals(formatDuration(45_000), "45s");
    assertEquals(formatDuration(1_000), "1s");
    assertEquals(formatDuration(0), "0s");
});

Deno.test("formatDuration — minutes and seconds", () => {
    assertEquals(formatDuration(192_000), "3m 12s");
    assertEquals(formatDuration(60_000), "1m 0s");
    assertEquals(formatDuration(119_000), "1m 59s");
});

Deno.test("formatDuration — hours", () => {
    assertEquals(formatDuration(3_660_000), "1h 1m 0s");
    assertEquals(formatDuration(7_230_000), "2h 0m 30s");
});

// ---- formatTime -------------------------------------------------------------

Deno.test("formatTime — HH:mm:ss", () => {
    assertEquals(formatTime(new Date("2026-06-07T14:32:05")), "14:32:05");
    assertEquals(formatTime(new Date("2026-06-07T00:00:00")), "00:00:00");
    assertEquals(formatTime(new Date("2026-06-07T23:59:59")), "23:59:59");
});

// ---- formatTokens -----------------------------------------------------------

Deno.test("formatTokens — raw digits (< 1k)", () => {
    assertEquals(formatTokens(0), "0");
    assertEquals(formatTokens(999), "999");
});

Deno.test("formatTokens — k suffix", () => {
    assertEquals(formatTokens(1_000), "1.0k");
    assertEquals(formatTokens(12_345), "12.3k");
    assertEquals(formatTokens(999_999), "1000.0k");
});

Deno.test("formatTokens — M suffix", () => {
    assertEquals(formatTokens(1_000_000), "1.0M");
    assertEquals(formatTokens(3_500_000), "3.5M");
});

// ---- calcCacheHitRate -------------------------------------------------------

function stats(hit: number, miss: number): SessionStats {
    return { ...createEmptyStats(), totalCacheHitTokens: hit, totalCacheMissTokens: miss };
}

Deno.test("calcCacheHitRate — no data", () => {
    assertEquals(calcCacheHitRate(stats(0, 0)), "--");
});

Deno.test("calcCacheHitRate — all hit", () => {
    assertEquals(calcCacheHitRate(stats(100, 0)), "100%");
});

Deno.test("calcCacheHitRate — mixed", () => {
    assertEquals(calcCacheHitRate(stats(73, 27)), "73%");
});

Deno.test("calcCacheHitRate — all miss", () => {
    assertEquals(calcCacheHitRate(stats(0, 50)), "0%");
});

// ---- calcRealTimeCost -------------------------------------------------------

function costStats(input: number, output: number, cacheHit: number): SessionStats {
    return {
        ...createEmptyStats(),
        totalInputTokens: input,
        totalOutputTokens: output,
        totalCacheHitTokens: cacheHit,
    };
}

Deno.test("calcRealTimeCost — unknown model returns --", () => {
    assertEquals(calcRealTimeCost("unknown-model", costStats(1000, 500, 0)), "--");
});

Deno.test("calcRealTimeCost — v4-flash small usage", () => {
    // ¥1/M input, ¥2/M output
    // 1000 input = ¥0.001, 500 output = ¥0.001 → ¥0.002
    const r = calcRealTimeCost("deepseek-v4-flash", costStats(1_000, 500, 0));
    assertEquals(r, "¥0.0020");
});

Deno.test("calcRealTimeCost — v4-flash with cache savings", () => {
    // input: ¥1/M, cache: ¥0.02/M
    // 1M input = ¥1.0, 0.5M cache hit saves ¥0.49, 600K output = ¥1.2
    const r = calcRealTimeCost("deepseek-v4-flash", costStats(1_000_000, 600_000, 500_000));
    assertEquals(r, "¥1.71");
});

Deno.test("calcRealTimeCost — v4-pro", () => {
    // ¥3/M input, ¥6/M output, cache ¥0.025/M
    const r = calcRealTimeCost("deepseek-v4-pro", costStats(1_000_000, 500_000, 0));
    // 1M*3 + 0.5M*6 = 3 + 3 = 6
    assertEquals(r, "¥6.00");
});

// ---- contextUsageRatio ------------------------------------------------------

Deno.test("contextUsageRatio", () => {
    assertEquals(contextUsageRatio(500_000, 1_000_000), 0.5);
    assertEquals(contextUsageRatio(0, 1_000_000), 0);
    assertEquals(contextUsageRatio(1_000_000, 1_000_000), 1.0);
});

// ---- calcCost (exit summary version — same logic, different format) ---------

Deno.test("calcCost — small usage shows 4 decimals", () => {
    const r = calcCost("deepseek-v4-flash", costStats(100, 50, 0));
    assertEquals(r, "¥0.0002");
});

Deno.test("calcCost — normal usage", () => {
    const r = calcCost("deepseek-v4-flash", costStats(1_000_000, 500_000, 200_000));
    assertEquals(r, "¥1.80");
});

Deno.test("calcCost — unknown model", () => {
    assertEquals(calcCost("gpt-4", costStats(100, 100, 0)), "N/A");
});

// ---- createEmptyStats -------------------------------------------------------

Deno.test("createEmptyStats — all fields zero", () => {
    const s = createEmptyStats();
    assertEquals(s.totalInputTokens, 0);
    assertEquals(s.totalOutputTokens, 0);
    assertEquals(s.totalCacheHitTokens, 0);
    assertEquals(s.totalCacheMissTokens, 0);
    assertEquals(s.totalReasoningTokens, 0);
    assertEquals(s.toolCallCount, 0);
    assertEquals(s.apiCallCount, 0);
    assertEquals(typeof s.startedAt, "number");
    assertEquals(s.startedAt > 0, true);
});

// ---- truncate (tasks.ts) ---------------------------------------------------

Deno.test("truncate — under limit returns unchanged", () => {
    assertEquals(truncate("hello", 100), "hello");
});

Deno.test("truncate — at limit returns unchanged", () => {
    const s = "a".repeat(100);
    assertEquals(truncate(s, 100), s);
});

Deno.test("truncate — over limit splits head and tail", () => {
    const s = "x".repeat(200);
    const r = truncate(s, 100);
    assertEquals(r.includes("[truncated"), true);
    assertEquals(r.startsWith("x"), true);
    assertEquals(r.endsWith("x"), true);
});

Deno.test("truncate — empty string", () => {
    assertEquals(truncate("", 100), "");
});

// ---- filterTools (transport.ts) --------------------------------------------

Deno.test("filterTools — returns matching tools", () => {
    const tools = filterTools(["bash"]);
    const fn = tools[0].function as Record<string, unknown>;
    assertEquals(tools.length, 1);
    assertEquals(fn.name, "bash");
});

Deno.test("filterTools — returns multiple tools", () => {
    const tools = filterTools(["bash", "list_background_tasks"]);
    assertEquals(tools.length, 2);
});

Deno.test("filterTools — empty list returns nothing", () => {
    const tools = filterTools([]);
    assertEquals(tools.length, 0);
});

Deno.test("filterTools — unknown tool returns nothing", () => {
    const tools = filterTools(["nonexistent"]);
    assertEquals(tools.length, 0);
});

// ---- accumulateToolCall (engine.ts) ----------------------------------------

Deno.test("accumulateToolCall — adds new tool call by index", () => {
    const buf = new Map<number, ToolCallBuf>();
    const delta = [{ index: 0, id: "call_1", function: { name: "bash", arguments: '{"command":' } }];
    accumulateToolCall(buf, delta);
    const tc = buf.get(0)!;
    assertEquals(tc.id, "call_1");
    assertEquals(tc.function.name, "bash");
    assertEquals(tc.function.arguments, '{"command":');
});

Deno.test("accumulateToolCall — appends arguments across chunks", () => {
    const buf = new Map<number, ToolCallBuf>();
    buf.set(0, { id: "call_1", type: "function", function: { name: "bash", arguments: '{"command":' } });
    const delta = [{ index: 0, function: { arguments: '"ls -la"}' } }];
    accumulateToolCall(buf, delta);
    assertEquals(buf.get(0)!.function.arguments, '{"command":"ls -la"}');
});

Deno.test("accumulateToolCall — handles multiple indices", () => {
    const buf = new Map<number, ToolCallBuf>();
    const delta = [
        { index: 0, id: "a", function: { name: "bash", arguments: "{}" } },
        { index: 1, id: "b", function: { name: "list_background_tasks", arguments: "{}" } },
    ];
    accumulateToolCall(buf, delta);
    assertEquals(buf.size, 2);
    assertEquals(buf.get(0)!.function.name, "bash");
    assertEquals(buf.get(1)!.function.name, "list_background_tasks");
});

// ---- decodeUtf8 (tasks.ts) -------------------------------------------------

Deno.test("decodeUtf8 — simple text", () => {
    assertEquals(decodeUtf8(new TextEncoder().encode("hello")), "hello");
});

Deno.test("decodeUtf8 — empty buffer", () => {
    assertEquals(decodeUtf8(new Uint8Array()), "");
});

// ---- nextId (tasks.ts) -----------------------------------------------------

Deno.test("nextId — uses custom uuid provider", () => {
    const id = nextId(() => "fixed-uuid-1234");
    assertEquals(id.startsWith("fixed-uu"), true);
});

Deno.test("nextId — includes uuid prefix and sequence", () => {
    const a = nextId(provider);
    const b = nextId(provider);
    assertEquals(a.startsWith("aaaa-bbb"), true);
    assertEquals(b.startsWith("aaaa-bbb"), true);
    assertEquals(a !== b, true);
});
const provider = () => "aaaa-bbbb-cccc";

// ---- TodoBoard -------------------------------------------------------------

Deno.test("TodoBoard — add and take", async () => {
    const { TodoBoard } = await import("./tools/todo.ts");
    const b = new TodoBoard();
    b.addToQueue("task 1");
    b.addToQueue("task 2");
    assertEquals(b.queueLength, 2);
    const taken = await b.take();
    assertEquals(taken, "task 1");
    assertEquals(b.queueLength, 1);
});

Deno.test("TodoBoard — clearQueue", async () => {
    const { TodoBoard } = await import("./tools/todo.ts");
    const b = new TodoBoard();
    b.addToQueue("x");
    b.clearQueue();
    assertEquals(b.queueLength, 0);
});

// ---- GoalManager -----------------------------------------------------------

Deno.test("GoalManager — lifecycle", async () => {
    const { goalManager } = await import("./tools/goal.ts");
    goalManager.set("test goal", 5);
    assertEquals(goalManager.active, true);
    assertEquals(goalManager.state?.objective, "test goal");
    goalManager.incrementTurn();
    assertEquals(goalManager.state?.turnsUsed, 1);
    goalManager.complete();
    assertEquals(goalManager.active, false);
    goalManager.clear();
    assertEquals(goalManager.state, null);
});

Deno.test("GoalManager — budget exceeded pauses", async () => {
    const { goalManager } = await import("./tools/goal.ts");
    goalManager.set("goal", 2);
    goalManager.incrementTurn();
    goalManager.incrementTurn();
    assertEquals(goalManager.state?.status, "paused");
    goalManager.clear();
});

Deno.test("GoalManager — toSystemPrompt", async () => {
    const { goalManager } = await import("./tools/goal.ts");
    goalManager.set("deploy app", 10);
    const prompt = goalManager.toSystemPrompt();
    assertEquals(prompt.includes("deploy app"), true);
    assertEquals(prompt.includes("GOAL"), true);
    goalManager.clear();
    assertEquals(goalManager.toSystemPrompt(), "");
});

// ---- currencySymbol --------------------------------------------------------

Deno.test("currencySymbol — CNY returns ¥", async () => {
    const { currencySymbol } = await import("./format.ts");
    assertEquals(currencySymbol({ currency: "CNY" }), "¥");
});

Deno.test("currencySymbol — USD returns $", async () => {
    const { currencySymbol } = await import("./format.ts");
    assertEquals(currencySymbol({ currency: "USD" }), "$");
});

// ---- command parser --------------------------------------------------------

Deno.test("parseCommand — accepts valid args", () => {
    assertEquals(
        parseCommand("/model deepseek-v4-flash", {
            name: "model",
            params: [{ name: "id", type: "string", required: false }],
            handler: () => null,
            desc: "",
        }).ok,
        true,
    );
});

Deno.test("parseCommand — rejects missing required arg", () => {
    const r = parseCommand("/session", {
        name: "session",
        params: [{ name: "action", type: "choice", choices: ["pause", "resume"], required: true }],
        handler: () => null,
        desc: "",
    });
    assertEquals(r.ok, false);
});

Deno.test("parseCommand — rejects extra args", () => {
    assertEquals(
        parseCommand("/help extra", {
            name: "help",
            params: [],
            handler: () => null,
            desc: "",
        }).ok,
        false,
    );
});

Deno.test("parseCommand — rejects wrong choice", () => {
    assertEquals(
        parseCommand("/session invalid", {
            name: "session",
            params: [{ name: "action", type: "choice", choices: ["pause", "resume"], required: true }],
            handler: () => null,
            desc: "",
        }).ok,
        false,
    );
});
