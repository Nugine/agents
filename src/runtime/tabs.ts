// ============================================================================
// Tab Manager — multi-agent tab state for the TUI.
// ============================================================================

import type { AgentManifest, Message, SessionStats } from "../types.ts";
import { createEmptyStats } from "../types.ts";

export interface TabState {
    agentId: string;
    title: string;
    manifest: AgentManifest;
    messages: Message[];
    stats: SessionStats;
}

class TabManager {
    readonly #tabs = new Map<string, TabState>();
    #activeId: string | null = null;
    #order: string[] = [];

    get activeId(): string | null {
        return this.#activeId;
    }

    get tabs(): TabState[] {
        return this.#order.map((id) => this.#tabs.get(id)!);
    }

    getTab(id: string): TabState | undefined {
        return this.#tabs.get(id);
    }

    createTab(agentId: string, manifest: AgentManifest, initialMessages: Message[]): TabState {
        const tab: TabState = {
            agentId,
            title: manifest.title,
            manifest,
            messages: initialMessages,
            stats: createEmptyStats(),
        };
        this.#tabs.set(agentId, tab);
        this.#order.push(agentId);
        if (!this.#activeId) this.#activeId = agentId;
        return tab;
    }

    switchTab(agentId: string): boolean {
        if (this.#tabs.has(agentId)) {
            this.#activeId = agentId;
            return true;
        }
        return false;
    }

    closeTab(agentId: string): TabState | undefined {
        const tab = this.#tabs.get(agentId);
        if (!tab) return undefined;
        this.#tabs.delete(agentId);
        this.#order = this.#order.filter((id) => id !== agentId);
        if (this.#activeId === agentId) {
            this.#activeId = this.#order[0] ?? null;
        }
        return tab;
    }

    nextTab(): void {
        if (this.#order.length < 2) return;
        const idx = this.#order.indexOf(this.#activeId!);
        this.#activeId = this.#order[(idx + 1) % this.#order.length];
    }

    prevTab(): void {
        if (this.#order.length < 2) return;
        const idx = this.#order.indexOf(this.#activeId!);
        this.#activeId = this.#order[(idx - 1 + this.#order.length) % this.#order.length];
    }
}

export const tabManager = Object.freeze(new TabManager()) as TabManager;
