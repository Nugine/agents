// ============================================================================
// Minion agent manifest.
// ============================================================================

import { Config } from "../config.ts";
import type { AgentManifest } from "../types.ts";

export const minionManifest: AgentManifest = {
    kind: "minion",
    title: "⬦ Minion",
    description: "ReAct 多工具编排 · 终端操作 · 多智能体调度 · 后台任务",
    systemPrompt: Config.systemPromptStable + Config.sharedToolGuidance,
    modelTier: "medium",
    disableTools: ["eval"],
};
