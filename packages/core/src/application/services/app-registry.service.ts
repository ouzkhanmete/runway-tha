import type { App } from "../../domain/app";
import type { AppRepository } from "../ports/app-repository";

interface AppRegistryDeps {
  apps: AppRepository;
}

export class AppRegistryService {
  constructor(private deps: AppRegistryDeps) {}

  /** Register (or return existing) an app. Name enrichment is deferred — name is always null. */
  async register(appId: string, country = "us"): Promise<App> {
    return this.deps.apps.create({ id: appId, name: null, country });
  }

  async list(): Promise<App[]> {
    return this.deps.apps.list();
  }

  async get(appId: string): Promise<App | null> {
    return this.deps.apps.findById(appId);
  }
}
