import { describe, expect, test } from "bun:test";
import type { AppMetadataClient } from "@packages/core/application/api-clients/app-metadata.api-client";
import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { App } from "@packages/core/domain/app";
import { Country } from "@packages/shared/index";
import { SyncSchedulerService } from "./sync-scheduler.service";

function makeApp(id: string, name: string | null = null): App {
  return { id, name, country: Country.US, createdAt: new Date(), claimedAt: null };
}

/** Fake AppRepository: claim returns `due`; records released ids and name updates. */
function fakeApps(
  due: App[],
  opts?: {
    onClaim?: (o: { staleBefore: Date; claimExpiredBefore: Date; claimedAt: Date }) => void;
  },
): AppRepository & { released: string[]; nameUpdates: Array<{ id: string; name: string }> } {
  const released: string[] = [];
  const nameUpdates: Array<{ id: string; name: string }> = [];
  return {
    released,
    nameUpdates,
    list: async () => [],
    findById: async () => null,
    create: async (input) => makeApp(input.id),
    claimDueForSync: async (o) => {
      opts?.onClaim?.(o);
      return due;
    },
    releaseClaim: async (id) => {
      released.push(id);
    },
    updateName: async (id, name) => {
      nameUpdates.push({ id, name });
    },
  };
}

/** Fake AppMetadataClient returning a fixed name; records the ids it was asked about. */
function fakeMetadata(name: string | null): AppMetadataClient & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    fetchAppName: async (appId) => {
      lookups.push(appId);
      return name;
    },
  };
}

const STALENESS_MS = 15 * 60_000;
const CLAIM_TTL_MS = 5 * 60_000;
const noIngest = { ingestApp: async () => ({ pagesFetched: 0, reviewsUpserted: 0 }) } as any;

describe("SyncSchedulerService", () => {
  test("claims with staleBefore = now - stalenessMs and claimExpiredBefore = now - claimTtlMs", async () => {
    const fixedNow = new Date("2026-06-08T12:00:00Z");
    const claimCalls: { staleBefore: Date; claimExpiredBefore: Date; claimedAt: Date }[] = [];

    const scheduler = new SyncSchedulerService({
      apps: fakeApps([], { onClaim: (o) => claimCalls.push(o) }),
      ingest: noIngest,
      appMetadata: fakeMetadata(null),
      stalenessMs: STALENESS_MS,
      claimTtlMs: CLAIM_TTL_MS,
      concurrency: 1,
      clock: () => fixedNow,
    });

    await scheduler.runDueOnce();

    expect(claimCalls).toHaveLength(1);
    expect(claimCalls[0].staleBefore.getTime()).toBe(fixedNow.getTime() - STALENESS_MS);
    expect(claimCalls[0].claimExpiredBefore.getTime()).toBe(fixedNow.getTime() - CLAIM_TTL_MS);
    expect(claimCalls[0].claimedAt.getTime()).toBe(fixedNow.getTime());
  });

  test("ingests every claimed app and releases each one", async () => {
    const apps = fakeApps([makeApp("app1"), makeApp("app2"), makeApp("app3")]);
    const ingestedIds: string[] = [];

    const scheduler = new SyncSchedulerService({
      apps,
      ingest: {
        ingestApp: async (app: App) => {
          ingestedIds.push(app.id);
          return { pagesFetched: 1, reviewsUpserted: 5 };
        },
      } as any,
      appMetadata: fakeMetadata(null),
      stalenessMs: STALENESS_MS,
      claimTtlMs: CLAIM_TTL_MS,
      concurrency: 2,
      clock: () => new Date(),
    });

    const result = await scheduler.runDueOnce();

    expect(ingestedIds.sort()).toEqual(["app1", "app2", "app3"]);
    expect(apps.released.sort()).toEqual(["app1", "app2", "app3"]);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
  });

  test("if one ingestApp throws the others still run, failed counts it, and ALL are released", async () => {
    const apps = fakeApps([makeApp("app1"), makeApp("app2"), makeApp("app3")]);
    const ingestedIds: string[] = [];

    const scheduler = new SyncSchedulerService({
      apps,
      ingest: {
        ingestApp: async (app: App) => {
          if (app.id === "app2") throw new Error("ingest failed for app2");
          ingestedIds.push(app.id);
          return { pagesFetched: 1, reviewsUpserted: 5 };
        },
      } as any,
      appMetadata: fakeMetadata(null),
      stalenessMs: STALENESS_MS,
      claimTtlMs: CLAIM_TTL_MS,
      concurrency: 3,
      clock: () => new Date(),
    });

    const result = await scheduler.runDueOnce();

    expect(ingestedIds.sort()).toEqual(["app1", "app3"]);
    // The lease is released even for the app that failed to ingest.
    expect(apps.released.sort()).toEqual(["app1", "app2", "app3"]);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(1);
  });

  test("returns processed=0, failed=0 and releases nothing when no apps are due", async () => {
    const apps = fakeApps([]);
    const scheduler = new SyncSchedulerService({
      apps,
      ingest: noIngest,
      appMetadata: fakeMetadata(null),
      stalenessMs: STALENESS_MS,
      claimTtlMs: CLAIM_TTL_MS,
      concurrency: 1,
      clock: () => new Date(),
    });

    const result = await scheduler.runDueOnce();
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
    expect(apps.released).toHaveLength(0);
  });

  test("backfills the name for apps whose name is null, and skips apps that already have one", async () => {
    const apps = fakeApps([makeApp("nameless"), makeApp("named", "Already Named")]);
    const metadata = fakeMetadata("Resolved Name");

    const scheduler = new SyncSchedulerService({
      apps,
      ingest: { ingestApp: async () => ({ pagesFetched: 1, reviewsUpserted: 1 }) } as any,
      appMetadata: metadata,
      stalenessMs: STALENESS_MS,
      claimTtlMs: CLAIM_TTL_MS,
      concurrency: 2,
      clock: () => new Date(),
    });

    await scheduler.runDueOnce();

    // Only the nameless app triggers a lookup + name update.
    expect(metadata.lookups).toEqual(["nameless"]);
    expect(apps.nameUpdates).toEqual([{ id: "nameless", name: "Resolved Name" }]);
  });

  test("a null lookup result leaves the name unset (no update)", async () => {
    const apps = fakeApps([makeApp("nameless")]);
    const scheduler = new SyncSchedulerService({
      apps,
      ingest: { ingestApp: async () => ({ pagesFetched: 1, reviewsUpserted: 1 }) } as any,
      appMetadata: fakeMetadata(null),
      stalenessMs: STALENESS_MS,
      claimTtlMs: CLAIM_TTL_MS,
      concurrency: 1,
      clock: () => new Date(),
    });

    await scheduler.runDueOnce();
    expect(apps.nameUpdates).toHaveLength(0);
  });
});
