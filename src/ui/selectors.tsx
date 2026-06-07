import { Box, Text } from "ink";
import type { AgentManifest, ModelInfo } from "../types.ts";

export function AgentSelector(props: { agents: AgentManifest[]; selectedIdx: number; onSelect: (id: string) => void }) {
    return (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
            <Text bold color="cyan">选择智能体</Text>
            {props.agents.map((a, i) => (
                <Box key={a.kind} flexDirection="column" marginLeft={1}>
                    <Text color={i === props.selectedIdx ? "cyan" : undefined} inverse={i === props.selectedIdx}>
                        {i === props.selectedIdx ? "› " : "  "}
                        {a.kind}
                    </Text>
                    <Text dimColor>{a.description}</Text>
                </Box>
            ))}
            <Text dimColor>↑↓ 选择 Enter 确认</Text>
        </Box>
    );
}

export function ModelSelector(
    props: {
        models: ModelInfo[];
        current: string;
        selectedIdx: number;
        onSelect: (id: string) => void;
        onClose: () => void;
    },
) {
    return (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1} marginY={1}>
            <Text bold color="yellow">选择模型</Text>
            {props.models.map((m, i) => (
                <Text key={m.id} color={i === props.selectedIdx ? "cyan" : undefined} inverse={i === props.selectedIdx}>
                    {i === props.selectedIdx ? "› " : "  "}
                    {m.id}
                    {m.id === props.current ? " (当前)" : ""}
                </Text>
            ))}
            <Text dimColor>↑↓ 选择 Enter 确认 Esc 取消</Text>
        </Box>
    );
}
