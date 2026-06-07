// ============================================================================
// Tool detection — probe for enhanced CLI tools at startup.
// ============================================================================

interface ToolHint {
    cmd: string;
    hint: string;
}

const TOOLS: Record<string, ToolHint> = {
    fd: { cmd: "fd", hint: "fd is available — prefer it over find. Faster and respects .gitignore." },
    rg: { cmd: "rg", hint: "rg is available — prefer it over grep. Faster and respects .gitignore." },
};

/** Probe for fd and rg. Returns a hint string to append to the system prompt (or ""). */
export function detectAvailableTools(): string {
    const available: string[] = [];
    for (const { cmd, hint } of Object.values(TOOLS)) {
        const proc = new Deno.Command("which", { args: [cmd], stdout: "null", stderr: "null" }).outputSync();
        const { code } = proc;
        if (code === 0) available.push(hint);
    }
    return available.length > 0 ? `\n\n\[Enhanced global tools\]\n${available.join("\n")}` : "";
}
