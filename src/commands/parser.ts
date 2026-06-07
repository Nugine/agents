// ============================================================================
// Command parser — validates and parses slash-command input.
// ============================================================================

export type ParamType = "string" | "int" | "choice";

export interface ParamDef {
    name: string;
    type: ParamType;
    required: boolean;
    choices?: string[];
    desc?: string;
}

export interface CommandDef {
    name: string;
    params: ParamDef[];
    handler: (args: Record<string, string | number>, ctx: Record<string, unknown>) => string | null;
    desc: string;
    panel?: string;
}

export type ParseResult =
    | { ok: true; args: Record<string, string | number>; name: string }
    | { ok: false; error: string };

export function parseCommand(input: string, def: CommandDef): ParseResult {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return { ok: false, error: "命令必须以 / 开头" };

    const parts = trimmed.slice(1).split(/\s+/);
    const cmdName = parts[0];
    if (cmdName !== def.name) return { ok: true, args: {}, name: cmdName }; // not this command

    return parseArgs(parts.slice(1), def);
}

function parseArgs(raw: string[], def: CommandDef): ParseResult {
    const result: Record<string, string | number> = {};

    // Positional: assign raw args to params in order
    for (let i = 0; i < def.params.length; i++) {
        const param = def.params[i];
        if (i < raw.length) {
            const val = validateParam(raw[i], param);
            if ("error" in val) return { ok: false, error: `${param.name}: ${val.error}` };
            result[param.name] = val.value;
        } else if (param.required) {
            return { ok: false, error: `缺少必需参数: ${param.name}` };
        }
    }

    // Reject extra args beyond defined params
    if (raw.length > def.params.length) {
        return { ok: false, error: `多余参数。最多接受 ${def.params.length} 个参数` };
    }

    return { ok: true, args: result, name: def.name };
}

function validateParam(raw: string, param: ParamDef): { value: string | number } | { error: string } {
    switch (param.type) {
        case "int": {
            const n = parseInt(raw, 10);
            if (isNaN(n)) return { error: `需要整数` };
            return { value: n };
        }
        case "choice": {
            if (param.choices && !param.choices.includes(raw)) {
                return { error: `可选值: ${param.choices.join(", ")}` };
            }
            return { value: raw };
        }
        default:
            return { value: raw };
    }
}
