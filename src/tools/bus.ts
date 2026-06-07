// ============================================================================
// Agent Message Bus — inter-agent communication.
// ============================================================================
// Global singleton that routes messages between agents.  Agents register
// themselves on first use; messages are queued per-recipient until recv()'d.
// ============================================================================

import type { AgentMessage } from "../types.ts";

export class MessageBus {
    readonly #queues = new Map<string, AgentMessage[]>();
    readonly #agents = new Set<string>();

    /** Register an agent (idempotent). */
    register(agentId: string): void {
        this.#agents.add(agentId);
        if (!this.#queues.has(agentId)) {
            this.#queues.set(agentId, []);
        }
    }

    /** Send a message to another agent. */
    send(from: string, to: string, content: string): void {
        this.register(from);
        this.register(to);
        const queue = this.#queues.get(to)!;
        queue.push({ from, to, content, timestamp: Date.now() });
    }

    /** Drain and return all messages for an agent. */
    recv(agentId: string): AgentMessage[] {
        this.register(agentId);
        const queue = this.#queues.get(agentId)!;
        const msgs = [...queue];
        queue.length = 0;
        return msgs;
    }

    /** Peek at messages without draining. */
    poll(agentId: string): AgentMessage[] {
        this.register(agentId);
        return [...this.#queues.get(agentId)!];
    }

    /** All known agent IDs. */
    listAgents(): string[] {
        return [...this.#agents];
    }
}

export const bus = Object.freeze(new MessageBus()) as MessageBus;
