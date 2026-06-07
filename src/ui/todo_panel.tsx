// ============================================================================
// TodoPanel — interactive queue + todo board overlay.
// ============================================================================

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { TodoBoard } from "../tools/todo.ts";

type FocusArea = "queue" | "todos";

export function TodoPanel(props: { board: TodoBoard; onClose: () => void }) {
    const { board } = props;
    const items = board.queueItems;
    const todos = board.todos;

    const [focus, setFocus] = useState<FocusArea>(items.length > 0 ? "queue" : "todos");
    const [qIdx, setQIdx] = useState(0);
    const [tIdx, setTIdx] = useState(0);
    const [confirmClear, setConfirmClear] = useState(false);

    useInput((input, key) => {
        if (key.escape) {
            if (confirmClear) {
                setConfirmClear(false);
                return;
            }
            props.onClose();
            return;
        }

        if (key.tab) {
            setConfirmClear(false);
            setFocus((f) => f === "queue" ? "todos" : "queue");
            return;
        }

        if (focus === "queue") {
            if (key.upArrow) {
                setQIdx((i) => Math.max(0, i - 1));
            }
            if (key.downArrow) {
                setQIdx((i) => Math.min(items.length - 1, i + 1));
            }
            if (input === "d" || input === "D") {
                board.removeFromQueue(qIdx);
                setQIdx((i) => Math.min(i, Math.max(0, items.length - 2)));
                setConfirmClear(false);
                if (items.length <= 1) setFocus("todos");
            }
            if (input === "c" || input === "C") {
                if (confirmClear) {
                    board.clearQueue();
                    setQIdx(0);
                    setConfirmClear(false);
                    setFocus("todos");
                } else {
                    setConfirmClear(true);
                    setTimeout(() => setConfirmClear(false), 3000);
                }
            }
        }

        if (focus === "todos") {
            if (key.upArrow) setTIdx((i) => Math.max(0, i - 1));
            if (key.downArrow) setTIdx((i) => Math.min(todos.length - 1, i + 1));
            if (input === " ") {
                const t = todos[tIdx];
                if (t) board.toggleTodoStatus(t.id);
            }
            setConfirmClear(false);
        }
    });

    const qClamped = Math.min(qIdx, Math.max(0, items.length - 1));
    const tClamped = Math.min(tIdx, Math.max(0, todos.length - 1));

    return (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} paddingY={1} marginBottom={1}>
            <Text bold color="cyan">
                待办面板 — 队列 {items.length} 项 | 任务 {board.todoDone}/{board.todoCount} 完成
            </Text>

            {items.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    <Text dimColor>
                        {focus === "queue" ? "▸" : " "} 队列 (↑↓ 移动 · d 删除 · c 清空):
                    </Text>
                    {items.map((item, i) => (
                        <Text key={i} dimColor={i !== qClamped || focus !== "queue"}>
                            {i === qClamped && focus === "queue" ? "› " : "  "}
                            {i}: {item.slice(0, 100)}
                        </Text>
                    ))}
                    {confirmClear && <Text color="red">确认清空队列？按 c 再次确认，Esc 取消</Text>}
                </Box>
            )}

            {todos.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    <Text dimColor>
                        {focus === "todos" ? "▸" : " "} 任务 (Space 切换状态):
                    </Text>
                    {todos.map((t, i) => {
                        const icon = t.status === "completed" ? "☑" : t.status === "in_progress" ? "▣" : "☐";
                        return (
                            <Text key={t.id} dimColor={i !== tClamped || focus !== "todos"}>
                                {i === tClamped && focus === "todos" ? "› " : "  "}
                                {icon} {t.id}. {t.text.slice(0, 100)}
                            </Text>
                        );
                    })}
                </Box>
            )}

            {items.length === 0 && todos.length === 0 && <Text dimColor>待办为空。</Text>}

            <Box marginTop={1}>
                <Text dimColor>Tab 切换区域 · Esc 关闭</Text>
            </Box>
        </Box>
    );
}
