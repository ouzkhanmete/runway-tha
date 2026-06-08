import type { Hono } from "hono";
import type { AppRegistryService } from "@runway/core";
import { RegisterAppRequestSchema } from "@runway/shared";
import { toAppDto } from "../mappers/review-dto.mapper";

export interface AppsDeps {
  registry: AppRegistryService;
}

export function registerAppRoutes(app: Hono, deps: AppsDeps): void {
  app.get("/apps", async (c) => {
    const apps = await deps.registry.list();
    return c.json(apps.map(toAppDto));
  });

  app.post("/apps", async (c) => {
    const body = RegisterAppRequestSchema.parse(
      await c.req.json().catch(() => ({}))
    );
    const registered = await deps.registry.register(body.appId, body.country);
    return c.json(toAppDto(registered), 201);
  });
}
