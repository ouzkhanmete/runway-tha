import { describe, expect, test } from "bun:test";
import type { SyncSchedulerService } from "@packages/core/index";
import { startLoop } from "./scheduler-loop";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("startLoop", () => {
  test("never runs two ticks concurrently even when a tick outlasts the interval", async () => {
    let active = 0;
    let maxActive = 0;
    let calls = 0;

    // Each tick (5ms of work) is slower than the 1ms interval. A naive setInterval would
    // stack overlapping runs; the self-rescheduling loop must serialize them.
    const scheduler = {
      runDueOnce: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        calls++;
        await sleep(5);
        active--;
        return { processed: 0, failed: 0 };
      },
    } as unknown as SyncSchedulerService;

    const { stop } = startLoop(scheduler, 1);
    await sleep(60);
    stop();

    expect(maxActive).toBe(1); // no overlap, ever
    expect(calls).toBeGreaterThan(1); // it actually looped
  });

  test("stop() halts further ticks", async () => {
    let calls = 0;
    const scheduler = {
      runDueOnce: async () => {
        calls++;
        return { processed: 0, failed: 0 };
      },
    } as unknown as SyncSchedulerService;

    const { stop } = startLoop(scheduler, 5);
    await sleep(20);
    stop();
    const callsAtStop = calls;

    await sleep(30);
    expect(calls).toBe(callsAtStop); // no ticks after stop
  });
});
