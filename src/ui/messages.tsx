// ============================================================================
// Message display components.
// ============================================================================

import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { Config } from "../config.ts";
import type {
    AccumulatingToolCall,
    AppStatus,
    AssistantMessage,
    Message,
    SystemMessage,
    ToolCall,
    ToolMessage,
    UserMessage,
} from "../types.ts";

const USERNAME = Deno.env.get("USER") || Deno.env.get("LOGNAME") || "user";

export function SystemMessageItem(props: { message: SystemMessage; expanded: boolean }) {
    const lines = props.message.content.split("\n");
    const display = props.expanded ? props.message.content : lines[0];
    const more = !props.expanded && lines.length > 1 ? ` (${lines.length - 1} more lines, Ctrl+S 展开)` : "";
    return <Text dimColor>⬦ system: {display}{more}</Text>;
}

export function UserMessageItem(props: { message: UserMessage }) {
    return <Text color="cyan">▸ {USERNAME}: {props.message.content}</Text>;
}

export function ReasoningBlock(props: { reasoning: string; expanded: boolean }) {
    if (!props.reasoning) return null;
    const lines = props.reasoning.split("\n");
    const displayLines = props.expanded ? lines : lines.slice(-Config.ui.reasoningCollapsedLines);
    const prefix = props.expanded ? "··· (思考) " : `··· (思考, 最后${Config.ui.reasoningCollapsedLines}行) `;
    return (
        <Box flexDirection="column">
            <Text dimColor>{prefix}Ctrl+R {props.expanded ? "折叠" : "展开"}</Text>
            {displayLines.map((line, i) => <Text key={i} dimColor>{line}</Text>)}
        </Box>
    );
}

export function ToolCallCard(props: { toolCall: ToolCall; result?: ToolMessage }) {
    let args: Record<string, unknown> = {};
    try {
        args = JSON.parse(props.toolCall.function.arguments) as Record<string, unknown>;
    } catch { /* */ }
    const name = props.toolCall.function.name;
    const display = name === "bash"
        ? `◆ bash: ${args.command ?? "?"}`
        : `◆ ${name}: ${JSON.stringify(args).slice(0, 100)}`;
    return (
        <Box flexDirection="column">
            <Text color="yellow">{display}</Text>
            {props.result
                ? (
                    <Box flexDirection="column">
                        <Text color="yellow" dimColor>{props.result.content.slice(0, 500)}</Text>
                    </Box>
                )
                : <Text color="yellow" dimColor>(等待结果...)</Text>}
        </Box>
    );
}

export function AssistantMessageItem(props: {
    message: AssistantMessage;
    toolResults: Map<string, ToolMessage>;
    reasoningExpanded: boolean;
    kind: string;
}) {
    return (
        <Box flexDirection="column">
            <ReasoningBlock reasoning={props.message.reasoning_content ?? ""} expanded={props.reasoningExpanded} />
            {props.message.tool_calls?.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} result={props.toolResults.get(tc.id)} />
            ))}
            {props.message.content
                ? <Text>◇ {props.kind}: {props.message.content}</Text>
                : props.message.tool_calls?.length
                ? null
                : <Text dimColor>◇ (无内容)</Text>}
        </Box>
    );
}

export function MessageArea(props: {
    completedMessages: Message[];
    toolResults: Map<string, ToolMessage>;
    reasoningExpanded: boolean;
    systemExpanded: boolean;
    kind: string;
}) {
    const items = props.completedMessages.map((msg, i) => {
        const key = `${i}-${msg.role}`;
        switch (msg.role) {
            case "system":
                return <SystemMessageItem key={key} message={msg} expanded={props.systemExpanded} />;
            case "user":
                return <UserMessageItem key={key} message={msg} />;
            case "assistant":
                return (
                    <AssistantMessageItem
                        key={key}
                        kind={props.kind}
                        message={msg}
                        toolResults={props.toolResults}
                        reasoningExpanded={props.reasoningExpanded}
                    />
                );
            default:
                return null;
        }
    }).filter(Boolean);
    return (
        <Box flexDirection="column">
            {items}
        </Box>
    );
}

const SPINNER = ["◴", "◷", "◶", "◵"];

export function StreamingLine(
    props: { text: string; reasoning: string; toolBuf: Map<number, AccumulatingToolCall>; status: AppStatus },
) {
    const [spinnerIdx, setSpinnerIdx] = useState(0);

    useEffect(() => {
        if (props.status !== "thinking" && props.status !== "tool_running") return;
        const id = setInterval(() => setSpinnerIdx((i) => (i + 1) % SPINNER.length), 100);
        return () => clearInterval(id);
    }, [props.status]);

    if (props.status !== "thinking" && props.status !== "tool_running") return null;

    const hasTools = props.toolBuf.size > 0;
    const phase = hasTools ? "调用工具" : props.text ? "回答" : props.reasoning ? "思考" : null;
    const phaseText = phase ? `${SPINNER[spinnerIdx]} 正在${phase}` : null;

    return (
        <Box flexDirection="column">
            {phaseText ? <Text dimColor>{phaseText}</Text> : null}
            {props.reasoning && !props.text && !hasTools ? <Text dimColor>· {props.reasoning.slice(-200)}</Text> : null}
            {hasTools
                ? [...props.toolBuf.values()].map((tc, i) => (
                    <Text key={i} color="yellow" dimColor>
                        ◆ {tc.function.name}({tc.function.arguments.slice(0, 80)})
                    </Text>
                ))
                : null}
            {props.text ? <Text dimColor>◇ {props.text}</Text> : null}
        </Box>
    );
}
