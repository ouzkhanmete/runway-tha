import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import { ensureMigrated, getTestDb, truncateAll } from "../helpers/test-db";
import { DrizzleAppRepository as AppRepo } from "../../src/infrastructure/repositories/app.repository";
import { DrizzleSyncRunRepository as SyncRunRepo } from "../../src/infrastructure/repositories/sync-run.repository";

const db = getTestDb();
const apps = new AppRepo(db);
const syncRuns = new SyncRunRepo(db);

beforeAll(async () => {
  await ensureMigrated();
});

beforeEach(async () => {
  await truncateAll(db);
});

describe("AppRepository", () => {
  describe("create", () => {
    test("creates an app and returns it", async () => {
      const app = await apps.create({ id: "12345", country: "us" });
      expect(app.id).toBe("12345");
      expect(app.country).toBe("us");
      expect(app.createdAt).toBeInstanceOf(Date);
    });

    test("is idempotent: second create same id → one row, no throw", async () => {
      await apps.create({ id: "dup-id", country: "us" });
      const app2 = await apps.create({ id: "dup-id", country: "us" });
      expect(app2.id).toBe("dup-id");
      const rows = await db.execute(sql`SELECT count(*)::int AS n FROM apps WHERE id = 'dup-id'`);
      expect((rows[0] as any).n).toBe(1);
    });

    test("default country is 'us'", async () => {
      const app = await apps.create({ id: "no-country" });
      expect(app.country).toBe("us");
    });
  });

  describe("findById", () => {
    test("returns app when it exists", async () => {
      await apps.create({ id: "find-me", country: "gb" });
      const app = await apps.findById("find-me");
      expect(app).not.toBeNull();
      expect(app!.id).toBe("find-me");
      expect(app!.country).toBe("gb");
    });

    test("returns null when app does not exist", async () => {
      const app = await apps.findById("does-not-exist");
      expect(app).toBeNull();
    });
  });

  describe("list", () => {
    test("returns all apps", async () => {
      await apps.create({ id: "a1" });
      await apps.create({ id: "a2" });
      const list = await apps.list();
      expect(list).toHaveLength(2);
    });

    test("returns empty array when no apps", async () => {
      const list = await apps.list();
      expect(list).toHaveLength(0);
    });
  });

  describe("findDueForSync", () => {
    test("app with NO sync_run is due", async () => {
      await apps.create({ id: "no-runs" });
      const staleBefore = new Date();
      const due = await apps.findDueForSync(staleBefore);
      expect(due.map((a) => a.id)).toContain("no-runs");
    });

    test("app with success run finished AFTER staleBefore is NOT due", async () => {
      await apps.create({ id: "fresh-app" });
      const staleBefore = new Date("2026-06-01T00:00:00Z");
      // Run finished after staleBefore
      const runId = await syncRuns.start("fresh-app");
      await syncRuns.finish(runId, {
        status: "success",
        pagesFetched: 1,
        reviewsUpserted: 0,
      });
      // staleBefore is in the past, so the run's finishedAt (now) is after staleBefore
      const due = await apps.findDueForSync(staleBefore);
      expect(due.map((a) => a.id)).not.toContain("fresh-app");
    });

    test("app whose only success run finished BEFORE staleBefore IS due", async () => {
      await apps.create({ id: "stale-app" });
      // Create a run and then manually set its finishedAt to a past date
      const runId = await syncRuns.start("stale-app");
      await syncRuns.finish(runId, {
        status: "success",
        pagesFetched: 1,
        reviewsUpserted: 0,
      });
      // Back-date the finishedAt to well before staleBefore
      await db.execute(
        sql`UPDATE sync_runs SET finished_at = '2026-01-01T00:00:00Z' WHERE id = ${runId}`
      );
      // staleBefore is after the run's finishedAt
      const staleBefore = new Date("2026-06-01T00:00:00Z");
      const due = await apps.findDueForSync(staleBefore);
      expect(due.map((a) => a.id)).toContain("stale-app");
    });

    test("app with only an error run (no success) IS due", async () => {
      await apps.create({ id: "errored-app" });
      const runId = await syncRuns.start("errored-app");
      await syncRuns.finish(runId, {
        status: "error",
        pagesFetched: 0,
        reviewsUpserted: 0,
        error: "network failure",
      });
      const staleBefore = new Date("2026-01-01T00:00:00Z");
      const due = await apps.findDueForSync(staleBefore);
      expect(due.map((a) => a.id)).toContain("errored-app");
    });
  });
});
