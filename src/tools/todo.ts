// ============================================================================
// TodoBoard — unified task board (user queue + model todos).
// ============================================================================

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
    id: number;
    text: string;
    status: TodoStatus;
}

export class TodoBoard {
    #queue: string[] = [];
    #todos: TodoItem[] = [];
    #nextId = 1;
    #resolve: (() => void) | null = null;

    // -- queue (user prompts) ---------------------------------------------------

    get queueLength(): number {
        return this.#queue.length;
    }
    get queueItems(): readonly string[] {
        return this.#queue;
    }

    addToQueue(prompt: string): void {
        this.#queue.push(prompt);
        this.#resolve?.();
    }

    removeFromQueue(index: number): string | undefined {
        if (index < 0 || index >= this.#queue.length) return undefined;
        const [item] = this.#queue.splice(index, 1);
        return item;
    }

    clearQueue(): void {
        this.#queue.length = 0;
    }

    async take(): Promise<string> {
        while (this.#queue.length === 0) {
            await new Promise<void>((r) => {
                this.#resolve = r;
            });
        }
        return this.#queue.shift()!;
    }

    // -- todos (model-written steps) --------------------------------------------

    get todos(): readonly TodoItem[] {
        return this.#todos;
    }
    get todoCount(): number {
        return this.#todos.length;
    }
    get todoDone(): number {
        return this.#todos.filter((t) => t.status === "completed").length;
    }

    updateTodos(items: Array<{ id?: number; text: string; status: TodoStatus }>): TodoItem[] {
        const resolved: TodoItem[] = [];
        for (const item of items.slice(0, 20)) {
            const id = item.id ?? this.#nextId++;
            const status = item.status === "in_progress" && resolved.some((r) => r.status === "in_progress")
                ? "pending"
                : item.status;
            resolved.push({ id, text: item.text.slice(0, 200), status });
        }
        this.#todos = resolved;
        if (!resolved.some((i) => i.status === "in_progress") && resolved.length > 0) {
            const first = resolved.find((i) => i.status === "pending");
            if (first) first.status = "in_progress";
        }
        return this.#todos;
    }

    // -- interactive toggle (used by TUI panel) ----------------------------------

    toggleTodoStatus(id: number): TodoItem | undefined {
        const item = this.#todos.find((t) => t.id === id);
        if (!item) return undefined;
        if (item.status === "pending") {
            for (const t of this.#todos) {
                if (t.status === "in_progress") t.status = "pending";
            }
            item.status = "in_progress";
        } else if (item.status === "in_progress") {
            item.status = "completed";
        } else {
            item.status = "pending";
        }
        return item;
    }

    // -- context injection ------------------------------------------------------

    toSystemPrompt(): string {
        if (this.#todos.length === 0) return "";
        const lines = this.#todos.map((i) => {
            const icon = i.status === "completed" ? "☑" : i.status === "in_progress" ? "▣" : "☐";
            return `${icon} ${i.id}. ${i.text}`;
        });
        const current = this.#todos.find((i) => i.status === "in_progress");
        const progress = current ? `Current: step ${current.id}/${this.#todos.length}.` : "";
        return `\n\n[TODO — ${this.todoDone}/${this.#todos.length} done]\n${lines.join("\n")}\n${progress}`;
    }
}
