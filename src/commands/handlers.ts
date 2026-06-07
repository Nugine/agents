// ============================================================================
// Built-in command definitions — registered at import time.
// ============================================================================

import { agentRegistry } from "../agents/mod.ts";
import { Config } from "../config.ts";
import { goalManager } from "../tools/goal.ts";
import type { CommandDef } from "./parser.ts";
import type { CommandContext } from "./types.ts";
import { getCommandNames, registerCommand } from "./mod.ts";

const defs: CommandDef[] = [
    {
        name: "model",
        params: [{ name: "id", type: "string", required: false, desc: "模型 ID" }],
        handler: (args, c) => {
            const ctx = c as unknown as CommandContext;
            if (!args.id) return null; // handled by panel toggle
            const target = args.id as string;
            const found = ctx.availableModels.find((m) => m.id === target);
            if (found) {
                ctx.setCurrentModel(target);
                return `已切换到 ${target}。`;
            }
            return `未知模型: ${target}。可用: ${ctx.availableModels.map((m) => m.id).join(", ")}`;
        },
        desc: "模型选择",
        panel: "model",
    },
    {
        name: "tasks",
        params: [],
        handler: () => null,
        desc: "后台任务",
        panel: "tasks",
    },
    {
        name: "todo",
        params: [
            {
                name: "action",
                type: "choice",
                choices: ["add", "del", "clear"],
                required: false,
                desc: "add | del | clear",
            },
            { name: "value", type: "string", required: false, desc: "文本或索引" },
        ],
        handler: (args, c) => {
            const ctx = c as unknown as CommandContext;
            if (!args.action) return null; // panel toggle
            if (args.action === "add" && args.value) {
                ctx.queueAdd(args.value as string);
                return "已加入队列。";
            }
            if (args.action === "del" && args.value) {
                const idx = parseInt(args.value as string, 10);
                const removed = ctx.queueDel(idx);
                return removed ? `已删除: ${removed.slice(0, 60)}` : `无效索引: ${idx}`;
            }
            if (args.action === "clear") {
                ctx.queueClear();
                return "队列已清空。";
            }
            return "用法: /todo add <text> | /todo del <idx> | /todo clear";
        },
        desc: "待办队列",
        panel: "todo",
    },
    {
        name: "session",
        params: [
            { name: "action", type: "choice", choices: ["pause", "resume"], required: true, desc: "pause | resume" },
        ],
        handler: (args, c) => {
            const ctx = c as unknown as CommandContext;
            if (args.action === "pause") {
                ctx.pauseInstance();
                return "会话已暂停。";
            }
            ctx.resumeInstance();
            return "会话已恢复。";
        },
        desc: "暂停/恢复会话",
    },
    {
        name: "budget",
        params: [{ name: "limit", type: "int", required: false, desc: "预算上限 (0=无限制)" }],
        handler: (args) => {
            if (args.limit != null) {
                const v = args.limit as number;
                (Config.budget as { limitCny: number }).limitCny = Math.max(0, v);
                return v > 0 ? `会话预算已设置为: ¥${v}` : "会话预算已取消限制。";
            }
            const limit = Config.budget.limitCny;
            return limit > 0 ? `会话预算: ¥${limit}` : "会话预算: 无限制";
        },
        desc: "查看/设置预算",
    },
    {
        name: "agents",
        params: [],
        handler: () => `智能体: ${agentRegistry.map((a) => `${a.kind} — ${a.description}`).join(" | ")}`,
        desc: "列出智能体",
    },
    {
        name: "reasoning",
        params: [
            {
                name: "effort",
                type: "choice",
                choices: ["low", "high", "max"],
                required: false,
                desc: "low | high | max",
            },
        ],
        handler: (args, c) => {
            const ctx = c as unknown as CommandContext;
            if (!args.effort) return `当前推理深度: ${ctx.getReasoningEffort()}`;
            ctx.setReasoningEffort(args.effort as string);
            return `推理深度已设置为: ${args.effort}`;
        },
        desc: "设置推理深度",
    },
    {
        name: "balance",
        params: [],
        handler: (_args, c) => {
            const ctx = c as unknown as CommandContext;
            ctx.refreshBalance();
            return "余额已刷新。";
        },
        desc: "刷新余额",
    },
    {
        name: "exit",
        params: [],
        handler: () => {
            Deno.exit(0);
        },
        desc: "退出",
    },
    {
        name: "goal",
        params: [
            {
                name: "action",
                type: "choice",
                choices: ["budget", "clear"],
                required: false,
                desc: "budget <N> | clear",
            },
            { name: "value", type: "string", required: false, desc: "目标文本或数值" },
        ],
        handler: (args, _ctx) => {
            if (!args.action) {
                const s = goalManager.state;
                if (!s) return "无活动目标。使用 /goal <text> 设置。";
                return `目标: ${s.objective} [${s.status}] · 轮次 ${s.turnsUsed}${
                    s.turnBudget > 0 ? `/${s.turnBudget}` : ""
                }`;
            }
            if (args.action === "budget" && args.value) {
                goalManager.setBudget(parseInt(args.value as string, 10) || 0);
                return "预算已更新。";
            }
            if (args.action === "clear") {
                goalManager.clear();
                return "目标已清除。";
            }
            return "用法: /goal <text> | /goal budget <N> | /goal clear";
        },
        desc: "设置自主目标",
    },
    {
        name: "clear",
        params: [],
        handler: () => "[clear]",
        desc: "清除对话历史",
    },
    {
        name: "help",
        params: [],
        handler: () => getCommandNames().map((n) => `/${n} — ${registry.get(n)?.desc ?? ""}`).join("\n"),
        desc: "帮助",
    },
];

const registry = new Map<string, CommandDef>();
for (const d of defs) {
    registry.set(d.name, d);
    registerCommand(d);
}
