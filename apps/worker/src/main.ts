import { buildWorker } from "./composition-root";
import { startLoop } from "./scheduler-loop";

const { env, scheduler, registry } = buildWorker();

console.log("[worker] Starting up...");

// Seed apps from environment
for (const appId of env.SEED_APP_IDS) {
  registry
    .register(appId)
    .then((app) => console.log(`[worker] Registered app: ${app.id} (${app.country})`))
    .catch((err) => console.error(`[worker] Failed to register app ${appId}:`, err));
}

// Start the scheduler loop
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
