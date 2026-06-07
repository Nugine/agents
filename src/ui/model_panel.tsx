// ============================================================================
// ModelPanel — keyboard-navigable model selector overlay.
// ============================================================================

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { Config } from "../config.ts";
import type { ModelInfo } from "../types.ts";

export function ModelPanel(props: {
    models: ModelInfo[];
    current: string;
    onSelect: (id: string) => void;
    onClose: () => void;
}) {
    const [idx, setIdx] = useState(0);

    useInput((_input, key) => {
        if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) setIdx((i) => Math.min(props.models.length - 1, i + 1));
        if (key.return) {
            props.onSelect(props.models[idx].id);
            props.onClose();
        }
        if (key.escape) props.onClose();
    });

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="yellow"
            paddingX={1}
            paddingY={1}
            marginBottom={1}
        >
            <Text bold color="yellow">选择模型 (↑↓ Enter Esc)</Text>
            {props.models.map((m, i) => {
                const meta = (Config.modelMeta as Record<
                    string,
                    { contextK: number; maxOutputK: number; reasoning: string; desc: string }
                >)[m.id];
                return (
                    <Box key={m.id} flexDirection="column">
                        <Text color={i === idx ? "cyan" : undefined} inverse={i === idx}>
                            {i === idx ? "› " : "  "}
                            {m.id} {m.provider ? `[${m.provider}]` : ""}
                            {m.id === props.current ? " (当前)" : ""}
                        </Text>
                        {meta
                            ? (
                                <Text dimColor>
                                    {"   "}
                                    {meta.contextK}K ctx | {meta.maxOutputK}K out | 推理: {meta.reasoning} | {meta.desc}
                                </Text>
                            )
                            : null}
                    </Box>
                );
            })}
        </Box>
    );
}
