import type { SyncSchedulerService } from "@packages/core/index";

/**
 * Drives the scheduler on a fixed cadence. Uses a self-rescheduling `setTimeout`
 * rather than `setInterval`: the next tick is scheduled only *after* the current one
 * fully settles. This makes overlapping runs impossible by construction — a slow or
 * stalled tick simply delays the next one instead of stacking up behind it. The gap
 * between the end of one run and the start of the next is always `tickMs`.
 */
export function startLoop(scheduler: SyncSchedulerService, tickMs: number): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    try {
      const result = await scheduler.runDueOnce();
      console.log(
        `[worker] Sync run complete — processed: ${result.processed}, failed: ${result.failed}`,
      );
    } catch (err) {
      console.error("[worker] Unexpected error in scheduler run:", err);
    } finally {
      // Only reschedule once this run is done, and only if we have not been stopped.
      if (!stopped) {
        timer = setTimeout(tick, tickMs);
      }
    }
  }

  // Run immediately on start; subsequent runs are chained from each tick's completion.
  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      console.log("[worker] Scheduler loop stopped.");
    },
  };
}
