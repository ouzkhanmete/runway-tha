import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { App } from "@packages/core/domain/app";
import { Country } from "@packages/shared/index";

interface AppRegistryDeps {
  apps: AppRepository;
}

export class AppRegistryService {
  constructor(private deps: AppRegistryDeps) {}

  /** Register (or return existing) an app. Name enrichment is deferred — name is always null. */
  async register(appId: string, country: Country = Country.US): Promise<App> {
    return this.deps.apps.create({ id: appId, name: null, country });
  }

  async list(): Promise<App[]> {
    return this.deps.apps.list();
  }

  async get(appId: string): Promise<App | null> {
    return this.deps.apps.findById(appId);
  }
}
