import type { AppMetadataClient } from "@packages/core/application/api-clients/app-metadata.api-client";
import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { App } from "@packages/core/domain/app";
import { ValidationError } from "@packages/core/domain/errors";
import { Country } from "@packages/shared/index";

interface AppRegistryDeps {
  apps: AppRepository;
  appMetadata: AppMetadataClient;
}

export class AppRegistryService {
  constructor(private deps: AppRegistryDeps) {}

  /**
   * Register (or return existing) an app. On a new registration the app is looked
   * up synchronously to validate it exists on the App Store and to capture its
   * display name, which is inserted immediately. Already-tracked apps are returned
   * as-is (idempotent — no lookup).
   */
  async register(appId: string, country?: Country): Promise<App> {
    const existing = await this.deps.apps.findById(appId);
    if (existing) return existing;

    const r = await this.deps.appMetadata.lookup(appId, country ?? Country.US);
    if (!r.found) throw new ValidationError("App not found in the App Store: " + appId);

    return this.deps.apps.create({ id: appId, name: r.name, country });
  }

  async list(): Promise<App[]> {
    return this.deps.apps.list();
  }

  async get(appId: string): Promise<App | null> {
    return this.deps.apps.findById(appId);
  }
}
