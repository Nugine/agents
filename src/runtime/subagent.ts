// ============================================================================
// Sub-agent runtime — summary generation helpers.
// ============================================================================

import type { Message } from "../types.ts";

export function generateSummary(messages: Message[]): string {
    const userMsgs = messages.filter((m) => m.role === "user").length;
    const assistantMsgs = messages.filter((m) => m.role === "assistant").length;
    const toolMsgs = messages.filter((m) => m.role === "tool").length;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content);
    const lastContent = lastAssistant?.content?.slice(0, 500) ?? "(no response)";
    return `Messages: ${userMsgs}u/${assistantMsgs}a/${toolMsgs}t. Last: ${lastContent}`;
}
