// ============================================================================
// Conversation loop engine — SSE streaming with tool call accumulation.
// ============================================================================

import { filterTools, getProvider } from "./transport.ts";
import type { AccumulatingToolCall, Message, StreamResult, TokenUsage, ToolCall } from "./types.ts";

export interface ToolCallBuf {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

export function accumulateToolCall(
    toolBuf: Map<number, ToolCallBuf>,
    tcDelta: Array<Record<string, unknown>>,
): Map<number, ToolCallBuf> {
    for (const tc of tcDelta) {
        const idx = tc.index as number;
        const cur = toolBuf.get(idx) ?? { id: "", type: "function" as const, function: { name: "", arguments: "" } };
        if (tc.id) cur.id = tc.id as string;
        if (tc.function) {
            const fn = tc.function as Record<string, unknown>;
            if (fn.name) cur.function.name = fn.name as string;
            if (fn.arguments) cur.function.arguments += fn.arguments as string;
        }
        toolBuf.set(idx, cur);
    }
    return toolBuf;
}

export async function runStreamLoop(
    model: string,
    messages: Message[],
    onText: (fullTextSoFar: string) => void,
    onReasoning: (fullReasoningSoFar: string) => void,
    onToolBuf: (buf: Map<number, AccumulatingToolCall>) => void,
    enabledToolNames: string[],
    reasoningEffort?: string,
    signal?: AbortSignal,
): Promise<StreamResult> {
    let content = "";
    let reasoning = "";
    const toolBuf = new Map<number, ToolCallBuf>();
    let usage: TokenUsage | null = null;

    const provider = getProvider();
    const tools = filterTools(enabledToolNames);

    let finishReason: string | undefined;

    for await (const chunk of provider.chatCompletions(model, messages, tools, reasoningEffort, signal)) {
        // Capture usage from any chunk shape — may appear with or without choices
        if (chunk.usage) usage = chunk.usage as TokenUsage;

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        if (!choices || choices.length === 0) continue;

        const delta = choices[0].delta as Record<string, unknown> | undefined;
        const fr = choices[0].finish_reason as string | undefined;
        if (delta) {
            if (typeof delta.content === "string") {
                content += delta.content;
                onText(content);
            }
            if (typeof delta.reasoning_content === "string") {
                reasoning += delta.reasoning_content;
                onReasoning(reasoning);
            }
            const tcDelta = delta.tool_calls as Array<Record<string, unknown>> | undefined;
            if (tcDelta) {
                accumulateToolCall(toolBuf, tcDelta);
                onToolBuf(new Map(toolBuf));
            }
        }
        // Defer return — usage often arrives in a later chunk after finish_reason
        if (fr && !finishReason) finishReason = fr;
    }

    if (finishReason === "tool_calls") {
        const toolCalls: ToolCall[] = [...toolBuf.values()].filter((tc) => tc.id !== "");
        return { finishReason, content: content || null, reasoning, toolCalls, usage };
    }
    return {
        finishReason: (finishReason as StreamResult["finishReason"]) || "stop",
        content: content || null,
        reasoning,
        toolCalls: [],
        usage,
    };
}
