// ============================================================================
// Unit tests — message bus, timer manager, scheduler, todo board.
// ============================================================================

import { assertEquals } from "jsr:@std/assert@1";
import { MessageBus } from "./tools/bus.ts";
import { TimerManager } from "./tools/timers.ts";
import { TodoBoard } from "./tools/todo.ts";

// ---- MessageBus -------------------------------------------------------------

Deno.test("MessageBus — register and send", () => {
    const bus = new MessageBus();
    bus.register("agent-a");
    bus.register("agent-b");
    bus.send("agent-a", "agent-b", "hello");
    const msgs = bus.recv("agent-b");
    assertEquals(msgs.length, 1);
    assertEquals(msgs[0].from, "agent-a");
    assertEquals(msgs[0].to, "agent-b");
    assertEquals(msgs[0].content, "hello");
    assertEquals(typeof msgs[0].timestamp, "number");
});

Deno.test("MessageBus — recv drains queue", () => {
    const bus = new MessageBus();
    bus.send("a", "b", "msg1");
    bus.send("a", "b", "msg2");
    const first = bus.recv("b");
    assertEquals(first.length, 2);
    const second = bus.recv("b");
    assertEquals(second.length, 0);
});

Deno.test("MessageBus — multiple recipients", () => {
    const bus = new MessageBus();
    bus.send("a", "b", "for B");
    bus.send("a", "c", "for C");
    const bMsgs = bus.recv("b");
    const cMsgs = bus.recv("c");
    assertEquals(bMsgs.length, 1);
    assertEquals(bMsgs[0].content, "for B");
    assertEquals(cMsgs.length, 1);
    assertEquals(cMsgs[0].content, "for C");
});

Deno.test("MessageBus — listAgents returns registered agents", () => {
    const bus = new MessageBus();
    bus.register("x");
    bus.register("y");
    bus.send("x", "y", "hi");
    const agents = bus.listAgents();
    assertEquals(agents.includes("x"), true);
    assertEquals(agents.includes("y"), true);
});

Deno.test("MessageBus — recv on unknown agent returns empty", () => {
    const bus = new MessageBus();
    const msgs = bus.recv("unknown");
    assertEquals(msgs.length, 0);
});

// ---- TimerManager -----------------------------------------------------------

Deno.test("TimerManager — initially not sleeping", () => {
    const tm = new TimerManager();
    assertEquals(tm.sleeping, false);
    assertEquals(tm.sleepRemaining(), 0);
});

Deno.test("TimerManager — sleep sets sleeping state", async () => {
    const tm = new TimerManager();
    const promise = tm.sleep(0.1); // 100ms
    assertEquals(tm.sleeping, true);
    assertEquals(tm.sleepRemaining() > 0, true);
    await promise;
    assertEquals(tm.sleeping, false);
    assertEquals(tm.sleepRemaining(), 0);
});

Deno.test("TimerManager — wakeUp interrupts sleep", async () => {
    const tm = new TimerManager();
    const promise = tm.sleep(10); // 10 seconds
    assertEquals(tm.sleeping, true);
    tm.wakeUp();
    await promise; // should resolve immediately after wakeUp
    assertEquals(tm.sleeping, false);
});

Deno.test("TimerManager — setAlarm returns string id", () => {
    const tm = new TimerManager();
    const id = tm.setAlarm(60, "agent", "msg");
    assertEquals(typeof id, "string");
    assertEquals(id.length > 0, true);
});

Deno.test("TimerManager — cancelAlarm removes pending alarm", () => {
    const tm = new TimerManager();
    const id = tm.setAlarm(60, "agent", "msg");
    const cancelled = tm.cancelAlarm(id);
    assertEquals(cancelled, true);
    assertEquals(tm.cancelAlarm("nonexistent"), false);
});

// ---- TodoBoard --------------------------------------------------------------

Deno.test("TodoBoard — queueLength reflects pending items", () => {
    const board = new TodoBoard();
    assertEquals(board.queueLength, 0);
    board.addToQueue("task 1");
    assertEquals(board.queueLength, 1);
    board.addToQueue("task 2");
    assertEquals(board.queueLength, 2);
    board.clearQueue();
    assertEquals(board.queueLength, 0);
});

Deno.test("TodoBoard — addToQueue and takeFromQueue", () => {
    const board = new TodoBoard();
    board.addToQueue("first");
    board.addToQueue("second");
    const item = board.removeFromQueue(0);
    assertEquals(item, "first");
    assertEquals(board.queueLength, 1);
});

Deno.test("TodoBoard — clearQueue empties queue", () => {
    const board = new TodoBoard();
    board.addToQueue("a");
    board.addToQueue("b");
    board.addToQueue("c");
    board.clearQueue();
    assertEquals(board.queueLength, 0);
    assertEquals(board.removeFromQueue(0), undefined);
});
