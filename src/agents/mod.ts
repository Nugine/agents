// ============================================================================
// Agent registry — central list of all known agent manifests.
// ============================================================================

import type { AgentManifest } from "../types.ts";
import { minionManifest } from "./minion.ts";
import { fireflyManifest } from "./firefly.ts";
import { sparkManifest } from "./spark.ts";

/** Ordered list of available agents (shown in the selection screen). */
export const agentRegistry: readonly AgentManifest[] = Object.freeze([minionManifest, sparkManifest, fireflyManifest]);

/** Look up an agent by its manifest id. */
export function getAgent(kind: import("../types.ts").AgentKind): AgentManifest | undefined {
    return agentRegistry.find((a) => a.kind === kind);
}
