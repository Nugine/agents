import type { ModelInfo } from "../types.ts";

export interface CommandContext {
    setCurrentModel: (m: string) => void;
    availableModels: ModelInfo[];
    currentModel: string;
    refreshBalance: () => void;
    taskList: () => string;
    queueItems: () => string[];
    queueAdd: (p: string) => void;
    queueDel: (i: number) => string | undefined;
    queueClear: () => void;
    togglePanel: (name: string) => void;
    pauseInstance: () => void;
    resumeInstance: () => void;
    setReasoningEffort: (e: string) => void;
    getReasoningEffort: () => string;
}
