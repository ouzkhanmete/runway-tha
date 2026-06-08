import type { Hono } from "hono";

export function registerHealthRoutes(app: Hono, _deps: unknown): void {
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });
}
