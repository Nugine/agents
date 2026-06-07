// ============================================================================
// AskManager — allows agents to ask the user questions mid-task.
// ============================================================================

export interface AskQuestion {
    id: number;
    text: string;
    options?: string[];
}

interface PendingAsk {
    questions: AskQuestion[];
    resolve: (answers: Record<number, string>) => void;
}

export class AskManager {
    #pending: PendingAsk | null = null;
    #nextId = 1;

    /** Does the agent have a question pending for the user? */
    get hasPending(): boolean {
        return this.#pending !== null;
    }

    /** Get current pending questions (null if none). */
    get questions(): AskQuestion[] | null {
        return this.#pending?.questions ?? null;
    }

    /**
     * Ask the user one or more questions. Returns a promise that resolves
     * when the user answers (or rejects on timeout).
     */
    ask(questions: Array<{ text: string; options?: string[] }>): Promise<Record<number, string>> {
        const items: AskQuestion[] = questions.map((q) => ({ id: this.#nextId++, text: q.text, options: q.options }));
        return new Promise((resolve) => {
            this.#pending = { questions: items, resolve };
        });
    }

    /** Answer a single question by id. */
    /** Submit all answers. */
    submitAll(): Record<number, string> | null {
        if (!this.#pending) return null;
        this.#pending = null;
        return {};
    }

    /** Resolve with a map of id→answer. */
    resolveAll(answers: Record<number, string>): void {
        if (!this.#pending) return;
        const p = this.#pending;
        this.#pending = null;
        p.resolve(answers);
    }
}

export const askManager = Object.freeze(new AskManager()) as AskManager;
