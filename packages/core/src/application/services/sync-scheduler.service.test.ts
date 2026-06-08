import { describe, expect, test } from "bun:test";
import type { App } from "@packages/core/domain/app";
import { Country } from "@packages/shared/index";
import { SyncSchedulerService } from "./sync-scheduler.service";

function makeApp(id: string): App {
  return {
    id,
    name: null,
    country: Country.US,
    createdAt: new Date(),
  };
}

describe("SyncSchedulerService", () => {
  test("calls findDueForSync with (now - stalenessMs)", async () => {
    const fixedNow = new Date("2026-06-08T12:00:00Z");
    const stalenessMs = 15 * 60_000;
    const expectedStaleBefore = new Date(fixedNow.getTime() - stalenessMs);

    const dueSyncCalls: Date[] = [];
    const fakeApps = {
      list: async () => [],
      findById: async () => null,
      create: async (input: { id: string }) => makeApp(input.id),
      findDueForSync: async (staleBefore: Date) => {
        dueSyncCalls.push(staleBefore);
        return [];
      },
    };
    const fakeIngest = {
      ingestApp: async () => ({ pagesFetched: 0, reviewsUpserted: 0 }),
    };

    const scheduler = new SyncSchedulerService({
      apps: fakeApps,
      ingest: fakeIngest as any,
      stalenessMs,
      concurrency: 1,
      clock: () => fixedNow,
    });

    await scheduler.runDueOnce();

    expect(dueSyncCalls).toHaveLength(1);
    expect(dueSyncCalls[0].getTime()).toBe(expectedStaleBefore.getTime());
  });

  test("ingests every due app", async () => {
    const apps = [makeApp("app1"), makeApp("app2"), makeApp("app3")];
    const ingestedIds: string[] = [];

    const fakeApps = {
      list: async () => [],
      findById: async () => null,
      create: async (input: { id: string }) => makeApp(input.id),
      findDueForSync: async () => apps,
    };
    const fakeIngest = {
      ingestApp: async (app: App) => {
        ingestedIds.push(app.id);
        return { pagesFetched: 1, reviewsUpserted: 5 };
      },
    };

    const scheduler = new SyncSchedulerService({
      apps: fakeApps,
      ingest: fakeIngest as any,
      stalenessMs: 15 * 60_000,
      concurrency: 2,
      clock: () => new Date(),
    });

    const result = await scheduler.runDueOnce();

    expect(ingestedIds.sort()).toEqual(["app1", "app2", "app3"]);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);
  });

  test("if one ingestApp throws the others still run and failed counts it", async () => {
    const apps = [makeApp("app1"), makeApp("app2"), makeApp("app3")];
    const ingestedIds: string[] = [];

    const fakeApps = {
      list: async () => [],
      findById: async () => null,
      create: async (input: { id: string }) => makeApp(input.id),
      findDueForSync: async () => apps,
    };
    const fakeIngest = {
      ingestApp: async (app: App) => {
        if (app.id === "app2") {
          throw new Error("ingest failed for app2");
        }
        ingestedIds.push(app.id);
        return { pagesFetched: 1, reviewsUpserted: 5 };
      },
    };

    const scheduler = new SyncSchedulerService({
      apps: fakeApps,
      ingest: fakeIngest as any,
      stalenessMs: 15 * 60_000,
      concurrency: 3,
      clock: () => new Date(),
    });

    const result = await scheduler.runDueOnce();

    // Both non-failing apps should have been processed
    expect(ingestedIds.sort()).toEqual(["app1", "app3"]);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(1);
  });

  test("returns processed=0, failed=0 when no apps are due", async () => {
    const fakeApps = {
      list: async () => [],
      findById: async () => null,
      create: async (input: { id: string }) => makeApp(input.id),
      findDueForSync: async () => [],
    };
    const fakeIngest = {
      ingestApp: async () => ({ pagesFetched: 0, reviewsUpserted: 0 }),
    };

    const scheduler = new SyncSchedulerService({
      apps: fakeApps,
      ingest: fakeIngest as any,
      stalenessMs: 15 * 60_000,
      concurrency: 1,
      clock: () => new Date(),
    });

    const result = await scheduler.runDueOnce();
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });
});
