import { Box, Text } from "ink";
import { useEffect, useState } from "react";

export function InputBar(props: { value: string; cursorPos: number; onSubmit: () => void }) {
    const { value, cursorPos } = props;
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const id = setInterval(() => setVisible((v) => !v), 500);
        return () => clearInterval(id);
    }, []);

    // Reset visible on cursor move so cursor always shows briefly after change
    useEffect(() => {
        setVisible(true);
    }, [cursorPos, value]);

    const lines = value.split("\n");

    // Map cursorPos to (lineIndex, column)
    let remaining = cursorPos;
    let cursorLine = 0;
    let cursorCol = 0;
    for (let i = 0; i < lines.length; i++) {
        const len = lines[i].length + 1;
        if (remaining < len) {
            cursorLine = i;
            cursorCol = remaining;
            break;
        }
        remaining -= len;
        cursorLine = i + 1;
        cursorCol = 0;
    }

    const cursor = visible ? <Text color="cyan">│</Text> : <Text></Text>;

    return (
        <Box flexDirection="column">
            {lines.map((line, i) => {
                const isCursorLine = i === cursorLine;
                const before = isCursorLine ? line.slice(0, cursorCol) : line;
                const after = isCursorLine ? line.slice(cursorCol) : "";
                const prefix = i === 0 ? "> " : "  ";

                return (
                    <Box key={i}>
                        <Text color="cyan" bold={i === 0}>{prefix}</Text>
                        <Text>{before}</Text>
                        {isCursorLine ? cursor : null}
                        <Text>{after}</Text>
                    </Box>
                );
            })}
        </Box>
    );
}
