import type { AppRegistryService } from "@packages/core/index";
import { RegisterAppRequestSchema } from "@packages/shared/index";
import type { Context, Hono } from "hono";
import { toAppDto } from "../mappers/review-dto.mapper";

export interface AppsDeps {
  registry: AppRegistryService;
}

export class AppsController {
  private readonly registry: AppRegistryService;

  constructor(deps: AppsDeps) {
    this.registry = deps.registry;
  }

  routes(app: Hono): void {
    app.get("/apps", (c) => this.list(c));
    app.post("/apps", (c) => this.register(c));
  }

  private async list(c: Context) {
    const apps = await this.registry.list();
    return c.json(apps.map(toAppDto));
  }

  private async register(c: Context) {
    const body = RegisterAppRequestSchema.parse(await c.req.json().catch(() => ({})));
    const registered = await this.registry.register(body.appId, body.country);
    return c.json(toAppDto(registered), 201);
  }
}
