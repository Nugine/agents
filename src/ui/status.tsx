// ============================================================================
// Status bar + divider.
// ============================================================================

import { Box, Text, useStdout } from "ink";
import { Config } from "../config.ts";
import { calcCacheHitRate, calcRealTimeCost, contextUsageRatio, formatTime, formatTokens } from "../format.ts";
import { timerManager } from "../tools/timers.ts";
import type { AppStatus, BalanceInfo, SessionStats } from "../types.ts";

export function StatusBar(props: {
    model: string;
    stats: SessionStats;
    status: AppStatus;
    thinkingMode: boolean;
    taskManager: { activeCount(): number };
    turnTokens: { output: number };
    todoCount?: number;
    todoDone?: number;
    paused?: boolean;
    reasoningEffort?: string;
    balance?: BalanceInfo | null;
    balanceTime?: Date | null;
    balanceError?: string | null;
}) {
    const { stats } = props;
    const bg = props.taskManager.activeCount();
    const sleepRem = timerManager.sleepRemaining();
    const cost = calcRealTimeCost(props.model, stats);
    const ratio = contextUsageRatio(stats.currentContextTokens, Config.context.maxTokens);

    const info = props.balance?.balance_infos[0];
    const balanceText = props.balanceError
        ? (info ? `¥${info.total_balance} (过期)` : "查询失败")
        : info
        ? `¥${info.total_balance}`
        : "加载中...";
    const timeText = props.balanceTime ? ` (${formatTime(props.balanceTime)})` : "";

    return (
        <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="flex-end">
                <Text dimColor>
                    {props.model} {props.reasoningEffort ?? "max"} | ◧{" "}
                    {formatTokens(stats.currentContextTokens)}/{formatTokens(Config.context.maxTokens)}{" "}
                    ({(ratio * 100).toFixed(0)}%) | ↑ {formatTokens(stats.totalInputTokens)} ↓{" "}
                    {formatTokens(stats.totalOutputTokens)} | ⊕ {calcCacheHitRate(stats)}
                </Text>
            </Box>
            <Box flexDirection="row" justifyContent="flex-end">
                <Text dimColor>
                    ◎ {stats.inFlightCalls} | ⚒ {stats.toolCallCount}
                    {bg > 0 ? ` | ⚙ ${bg}` : ""}
                    {props.todoCount
                        ? (props.todoDone ?? 0) >= props.todoCount
                            ? ` | ☑ ${props.todoDone ?? 0}/${props.todoCount}`
                            : ` | ☐ ${props.todoDone ?? 0}/${props.todoCount}`
                        : ""}
                    {sleepRem > 0 ? ` | ◷ ${sleepRem}s` : ""}
                    {" | "}
                    {cost} | {balanceText}
                    {timeText}
                </Text>
            </Box>
        </Box>
    );
}

export function HDivider() {
    const { stdout } = useStdout();
    const width = stdout?.columns ?? 80;
    return <Text dimColor>{"─".repeat(width)}</Text>;
}
