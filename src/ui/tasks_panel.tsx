// ============================================================================
// TasksPanel — interactive background task list overlay.
// ============================================================================

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { formatDuration } from "../format.ts";
import type { BgTask } from "../types.ts";
import type { TaskManager } from "../tools/tasks.ts";

function TaskDetail(props: { task: BgTask; taskManager: TaskManager }) {
    const out = (() => {
        if (props.task.status !== "running") return props.task.stdoutPreview ?? null;
        const r = props.taskManager.readOutput(props.task.id);
        return r ? `${r.stdout.slice(0, 500)}\n${r.stderr.slice(0, 500)}` : null;
    })();

    return (
        <Box flexDirection="column" marginTop={1}>
            <Text bold>⚙ {props.task.id} [{props.task.status}]</Text>
            <Text dimColor>{props.task.command.slice(0, 200)}</Text>
            {props.task.startedAt && (
                <Text dimColor>
                    启动: {formatDuration(Date.now() - props.task.startedAt)} 前
                    {props.task.finishedAt
                        ? ` · 耗时: ${formatDuration(props.task.finishedAt - props.task.startedAt)}`
                        : ""}
                </Text>
            )}
            {props.task.exitCode != null && <Text dimColor>exit: {props.task.exitCode}</Text>}
            {out
                ? (
                    <Box flexDirection="column" marginTop={1}>
                        <Text dimColor>── 输出 ──</Text>
                        <Text dimColor>{out}</Text>
                    </Box>
                )
                : null}
        </Box>
    );
}

export function TasksPanel(props: { taskManager: TaskManager; onClose: () => void }) {
    const tasks = props.taskManager.list();
    const [idx, setIdx] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    useInput((input, key) => {
        if (key.escape) {
            if (expanded) {
                setExpanded(false);
                return;
            }
            props.onClose();
            return;
        }

        if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) setIdx((i) => Math.min(tasks.length - 1, i + 1));
        if (key.return) setExpanded((v) => !v);
        if (input === "r" || input === "R") setRefreshKey((k) => k + 1);
        if ((input === "k" || input === "K") && tasks[idx]?.status === "running") {
            props.taskManager.kill(tasks[idx].id);
            setExpanded(false);
        }
    });

    const clamped = Math.min(idx, Math.max(0, tasks.length - 1));
    const selected = tasks[clamped];
    const hasRunning = tasks.some((t) => t.status === "running");

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="yellow"
            paddingX={1}
            paddingY={1}
            marginBottom={1}
        >
            <Text bold color="yellow">后台任务 ({tasks.length})</Text>

            {tasks.length === 0
                ? <Text dimColor>无活跃后台任务。</Text>
                : expanded && selected
                ? <TaskDetail key={`${selected.id}-${refreshKey}`} task={selected} taskManager={props.taskManager} />
                : tasks.map((t, i) => (
                    <Box key={t.id} flexDirection="column" marginTop={1}>
                        <Text dimColor={i !== clamped}>
                            {i === clamped ? "› " : "  "}
                            ⚙ {t.id} [{t.status}]
                        </Text>
                        <Text dimColor={i !== clamped}>{t.command.slice(0, 100)}</Text>
                        {t.startedAt && (
                            <Text dimColor={i !== clamped}>
                                启动: {formatDuration(Date.now() - t.startedAt)} 前
                                {t.exitCode != null ? ` · exit: ${t.exitCode}` : ""}
                            </Text>
                        )}
                    </Box>
                ))}

            <Box marginTop={1}>
                <Text dimColor>
                    ↑↓ 选择 · Enter {expanded ? "收起" : "展开"}
                    {hasRunning ? " · r 刷新" : ""}
                    {selected?.status === "running" ? " · k 终止" : ""}
                    {" · Esc "}
                    {expanded ? "返回列表" : "关闭"}
                </Text>
            </Box>
        </Box>
    );
}
