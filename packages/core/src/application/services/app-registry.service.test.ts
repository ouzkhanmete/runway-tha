import { describe, expect, test } from "bun:test";
import type {
  AppLookup,
  AppMetadataClient,
} from "@packages/core/application/api-clients/app-metadata.api-client";
import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { App } from "@packages/core/domain/app";
import { ValidationError } from "@packages/core/domain/errors";
import { Country } from "@packages/shared/index";
import { AppRegistryService } from "./app-registry.service";

function makeApp(id: string, name: string | null = null, country = Country.US): App {
  return { id, name, country, createdAt: new Date(), claimedAt: null };
}

/** Fake AppRepository: `existing` is returned by findById; create records its input. */
function fakeApps(existing: App | null): AppRepository & {
  created: Array<{ id: string; name?: string | null; country?: Country }>;
} {
  const created: Array<{ id: string; name?: string | null; country?: Country }> = [];
  return {
    created,
    list: async () => [],
    findById: async () => existing,
    create: async (input) => {
      created.push(input);
      return makeApp(input.id, input.name ?? null, input.country ?? Country.US);
    },
    claimDueForSync: async () => [],
    releaseClaim: async () => {},
  };
}

/** Fake AppMetadataClient returning a fixed lookup; records (id, country) it was asked about. */
function fakeMetadata(result: AppLookup): AppMetadataClient & {
  calls: Array<{ appId: string; country: string }>;
} {
  const calls: Array<{ appId: string; country: string }> = [];
  return {
    calls,
    lookup: async (appId, country) => {
      calls.push({ appId, country });
      return result;
    },
  };
}

describe("AppRegistryService", () => {
  test("registers and inserts the looked-up name when the app is found", async () => {
    const apps = fakeApps(null);
    const appMetadata = fakeMetadata({ found: true, name: "Tab - bill splitter" });
    const registry = new AppRegistryService({ apps, appMetadata });

    const result = await registry.register("595068606");

    expect(appMetadata.calls).toEqual([{ appId: "595068606", country: Country.US }]);
    expect(apps.created).toEqual([
      { id: "595068606", name: "Tab - bill splitter", country: undefined },
    ]);
    expect(result.name).toBe("Tab - bill splitter");
  });

  test("throws ValidationError when the app is not found", async () => {
    const apps = fakeApps(null);
    const appMetadata = fakeMetadata({ found: false });
    const registry = new AppRegistryService({ apps, appMetadata });

    await expect(registry.register("000000000")).rejects.toBeInstanceOf(ValidationError);
    await expect(registry.register("000000000")).rejects.toThrow(
      "App not found in the App Store: 000000000",
    );
    expect(apps.created).toHaveLength(0);
  });

  test("is idempotent: an already-tracked app is returned without a lookup", async () => {
    const existing = makeApp("595068606", "Already Named");
    const apps = fakeApps(existing);
    const appMetadata = fakeMetadata({ found: true, name: "Should Not Be Used" });
    const registry = new AppRegistryService({ apps, appMetadata });

    const result = await registry.register("595068606");

    expect(result).toBe(existing);
    expect(appMetadata.calls).toHaveLength(0);
    expect(apps.created).toHaveLength(0);
  });

  test("passes the country through to the lookup", async () => {
    const apps = fakeApps(null);
    const appMetadata = fakeMetadata({ found: true, name: "App" });
    const registry = new AppRegistryService({ apps, appMetadata });

    await registry.register("595068606", Country.GB);

    expect(appMetadata.calls).toEqual([{ appId: "595068606", country: Country.GB }]);
    expect(apps.created).toEqual([{ id: "595068606", name: "App", country: Country.GB }]);
  });
});
