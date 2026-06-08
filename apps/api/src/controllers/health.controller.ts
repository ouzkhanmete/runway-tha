import type { Context, Hono } from "hono";

export class HealthController {
  routes(app: Hono): void {
    app.get("/health", (c) => this.health(c));
  }

  private health(c: Context) {
    return c.json({ status: "ok" });
  }
}
