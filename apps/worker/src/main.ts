import { buildWorker } from "./composition-root";
import { startLoop } from "./scheduler-loop";

const { env, scheduler } = buildWorker();

console.log("[worker] Starting up...");

// Start the scheduler loop (runs one tick immediately, then on the interval).
// Apps are onboarded exclusively via the API (POST /apps); the worker picks them up on the next tick.
const { stop } = startLoop(scheduler, env.WORKER_TICK_MS);

// Graceful shutdown handlers
process.on("SIGINT", () => {
  console.log("[worker] Received SIGINT, shutting down...");
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[worker] Received SIGTERM, shutting down...");
  stop();
  process.exit(0);
});
