// ============================================================================
// Timer Manager — sleep / alarm for session-level time management.
// ============================================================================

import { bus } from "./bus.ts";

interface Alarm {
    id: string;
    timer: ReturnType<typeof setTimeout>;
    targetAgent: string;
    message: string;
    firesAt: number;
}

export class TimerManager {
    #alarms = new Map<string, Alarm>();
    #sleepUntil: number | null = null;
    #sleepResolve: (() => void) | null = null;
    #seq = 0;

    /** Is the current agent sleeping? */
    get sleeping(): boolean {
        return this.#sleepUntil !== null && Date.now() < this.#sleepUntil;
    }

    /** Remaining sleep seconds (0 if not sleeping). */
    sleepRemaining(): number {
        if (!this.#sleepUntil) return 0;
        return Math.max(0, Math.ceil((this.#sleepUntil - Date.now()) / 1000));
    }

    /** Sleep for N seconds. Returns a promise that resolves when sleep ends or is interrupted. */
    sleep(seconds: number): Promise<void> {
        this.#sleepUntil = Date.now() + seconds * 1000;
        return new Promise((resolve) => {
            this.#sleepResolve = resolve;
            setTimeout(() => {
                if (this.#sleepUntil && Date.now() >= this.#sleepUntil) {
                    this.#sleepUntil = null;
                    this.#sleepResolve = null;
                    resolve();
                }
            }, seconds * 1000);
        });
    }

    /** Interrupt sleep early. */
    wakeUp(): void {
        if (this.#sleepResolve) {
            this.#sleepResolve();
            this.#sleepResolve = null;
        }
        this.#sleepUntil = null;
    }

    /** Set an alarm. After `seconds`, sends `message` to `targetAgent` via the bus. */
    setAlarm(seconds: number, targetAgent: string, message: string): string {
        const id = `alarm_${++this.#seq}`;
        const firesAt = Date.now() + seconds * 1000;
        const timer = setTimeout(() => {
            bus.send("alarm", targetAgent, `[Alarm ${id}]\n${message}`);
            this.wakeUp();
            this.#alarms.delete(id);
        }, seconds * 1000);
        this.#alarms.set(id, { id, timer, targetAgent, message, firesAt });
        return id;
    }

    /** Cancel an alarm by ID. */
    cancelAlarm(id: string): boolean {
        const alarm = this.#alarms.get(id);
        if (!alarm) return false;
        clearTimeout(alarm.timer);
        this.#alarms.delete(id);
        return true;
    }

    /** List all pending alarms. */
    listAlarms(): Array<{ id: string; target: string; firesAt: number; message: string }> {
        return [...this.#alarms.values()].map((a) => ({
            id: a.id,
            target: a.targetAgent,
            firesAt: a.firesAt,
            message: a.message,
        }));
    }

    /** Cleanup on exit. */
    cleanup(): void {
        for (const a of this.#alarms.values()) clearTimeout(a.timer);
        this.#alarms.clear();
        this.#sleepUntil = null;
        this.#sleepResolve = null;
    }
}

export const timerManager = Object.freeze(new TimerManager()) as TimerManager;
