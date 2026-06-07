// ============================================================================
// GoalManager — autonomous goal-driven execution.
// ============================================================================

export interface GoalState {
    objective: string;
    status: "active" | "complete" | "paused";
    turnBudget: number;
    turnsUsed: number;
    startedAt: number;
}

export class GoalManager {
    #state: GoalState | null = null;

    get active(): boolean {
        return this.#state?.status === "active";
    }
    get state(): GoalState | null {
        return this.#state;
    }

    set(objective: string, turnBudget = 0): void {
        this.#state = { objective, status: "active", turnBudget, turnsUsed: 0, startedAt: Date.now() };
    }

    incrementTurn(): void {
        if (!this.#state || this.#state.status !== "active") return;
        this.#state.turnsUsed++;
        if (this.#state.turnBudget > 0 && this.#state.turnsUsed >= this.#state.turnBudget) {
            this.#state.status = "paused";
        }
    }

    complete(): void {
        if (this.#state) this.#state.status = "complete";
    }

    clear(): void {
        this.#state = null;
    }

    setBudget(n: number): void {
        if (this.#state) this.#state.turnBudget = n;
    }

    toSystemPrompt(): string {
        if (!this.#state || this.#state.status !== "active") return "";
        const budget = this.#state.turnBudget > 0
            ? ` (轮次 ${this.#state.turnsUsed}/${this.#state.turnBudget})`
            : ` (轮次 ${this.#state.turnsUsed})`;
        return `\n\n[GOAL] ${this.#state.objective}${budget}\n完成目标后自动停止。如无法完成请说明原因。`;
    }
}

export const goalManager = new GoalManager();
