import type { SyncSchedulerService } from "@packages/core/index";

export function startLoop(scheduler: SyncSchedulerService, tickMs: number): { stop: () => void } {
  let isRunning = false;

  async function tick() {
    if (isRunning) {
      console.log("[worker] Tick skipped — previous run still in progress.");
      return;
    }
    isRunning = true;
    try {
      const result = await scheduler.runDueOnce();
      console.log(
        `[worker] Sync run complete — processed: ${result.processed}, failed: ${result.failed}`,
      );
    } catch (err) {
      console.error("[worker] Unexpected error in scheduler run:", err);
    } finally {
      isRunning = false;
    }
  }

  // Run immediately on start
  tick();

  const interval = setInterval(tick, tickMs);

  return {
    stop: () => {
      clearInterval(interval);
      console.log("[worker] Scheduler loop stopped.");
    },
  };
}
