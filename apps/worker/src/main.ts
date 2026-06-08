import { buildWorker } from "./composition-root";
import { startLoop } from "./scheduler-loop";

const { env, scheduler, registry } = buildWorker();

console.log("[worker] Starting up...");

// Seed apps from environment. Await registration BEFORE starting the loop so the
// first (immediate) tick sees the seeded apps rather than racing the inserts.
await Promise.all(
  env.SEED_APP_IDS.map((appId) =>
    registry
      .register(appId)
      .then((app) => console.log(`[worker] Registered app: ${app.id} (${app.country})`))
      .catch((err) => console.error(`[worker] Failed to register app ${appId}:`, err)),
  ),
);

// Start the scheduler loop (runs one tick immediately, then on the interval).
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
