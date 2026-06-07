// ============================================================================
// Command registry — structured command definitions with argument validation.
// ============================================================================

import type { CommandDef } from "./parser.ts";
import { parseCommand } from "./parser.ts";
import type { CommandContext } from "./types.ts";

export type { CommandDef } from "./parser.ts";
export type { CommandContext } from "./types.ts";

const registry = new Map<string, CommandDef>();

export function registerCommand(def: CommandDef): void {
    registry.set(def.name, def);
}

export function getCommandNames(): string[] {
    return [...registry.keys()];
}

export function getCommandSyntax(name: string): string {
    const def = registry.get(name);
    if (!def) return `/${name}`;
    const params = def.params.map((p) => {
        const req = p.required ? `<${p.name}>` : `[${p.name}]`;
        return req;
    }).join(" ");
    return params ? `/${name} ${params}` : `/${name}`;
}

export function getCommandDefs(): Array<{ name: string; syntax: string; desc: string }> {
    return [...registry.values()].map((d) => ({
        name: d.name,
        syntax: getCommandSyntax(d.name),
        desc: d.desc,
    }));
}

export function handleCommand(input: string, ctx: CommandContext): string | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return null;

    const cmdName = trimmed.slice(1).split(/\s+/)[0];
    const def = registry.get(cmdName);
    if (!def) return `未知命令: /${cmdName}。输入 /help 查看可用命令。`;

    if (def.panel && input === `/${cmdName}`) {
        ctx.togglePanel(def.panel);
        return null;
    }

    const result = parseCommand(trimmed, def);
    if (!result.ok) return result.error;
    return def.handler(result.args, ctx as unknown as Record<string, unknown>);
}
