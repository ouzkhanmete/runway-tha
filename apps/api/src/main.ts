import { createApp } from "./app";
import { buildApi } from "./composition-root";

const { env, deps } = buildApi();
const app = createApp(deps);

Bun.serve({
  port: env.APP_PORT,
  fetch: app.fetch,
});

console.log(`[api] Server running on port ${env.APP_PORT}`);
