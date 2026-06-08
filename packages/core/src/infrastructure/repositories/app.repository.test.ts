import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { SyncStatus } from "@packages/core/domain/sync-status";
import { Country } from "@packages/shared/index";
import { sql } from "drizzle-orm";
import { ensureMigrated, getTestDb, truncateAll } from "../../../test/helpers/test-db";
import { DrizzleAppRepository as AppRepo } from "./app.repository";
import { DrizzleSyncRunRepository as SyncRunRepo } from "./sync-run.repository";

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
      const app = await apps.create({ id: "12345", country: Country.US });
      expect(app.id).toBe("12345");
      expect(app.country).toBe(Country.US);
      expect(app.createdAt).toBeInstanceOf(Date);
    });

    test("is idempotent: second create same id → one row, no throw", async () => {
      await apps.create({ id: "dup-id", country: Country.US });
      const app2 = await apps.create({ id: "dup-id", country: Country.US });
      expect(app2.id).toBe("dup-id");
      const rows = await db.execute(sql`SELECT count(*)::int AS n FROM apps WHERE id = 'dup-id'`);
      expect((rows[0] as any).n).toBe(1);
    });

    test("default country is 'us'", async () => {
      const app = await apps.create({ id: "no-country" });
      expect(app.country).toBe(Country.US);
    });
  });

  describe("findById", () => {
    test("returns app when it exists", async () => {
      await apps.create({ id: "find-me", country: Country.GB });
      const app = await apps.findById("find-me");
      expect(app).not.toBeNull();
      expect(app!.id).toBe("find-me");
      expect(app!.country).toBe(Country.GB);
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

  describe("claimDueForSync", () => {
    // Helper: claim with a fresh `now`, treating any claim older than 1 min as stuck.
    function claimOpts(staleBefore: Date, now = new Date()) {
      return {
        staleBefore,
        claimExpiredBefore: new Date(now.getTime() - 60_000),
        claimedAt: now,
      };
    }

    test("app with NO sync_run is due and gets claimed (claimed_at stamped)", async () => {
      await apps.create({ id: "no-runs" });
      const now = new Date();
      const claimed = await apps.claimDueForSync(claimOpts(now, now));
      expect(claimed.map((a) => a.id)).toContain("no-runs");
      // The returned row carries the lease timestamp...
      expect(claimed.find((a) => a.id === "no-runs")!.claimedAt).toBeInstanceOf(Date);
      // ...and it is persisted.
      const persisted = await apps.findById("no-runs");
      expect(persisted!.claimedAt).toBeInstanceOf(Date);
    });

    test("app with success run finished AFTER staleBefore is NOT due", async () => {
      await apps.create({ id: "fresh-app" });
      const staleBefore = new Date("2026-06-01T00:00:00Z");
      // Run finished after staleBefore
      const runId = await syncRuns.start("fresh-app");
      await syncRuns.finish(runId, {
        status: SyncStatus.Success,
        pagesFetched: 1,
        reviewsUpserted: 0,
      });
      // staleBefore is in the past, so the run's finishedAt (now) is after staleBefore
      const claimed = await apps.claimDueForSync(claimOpts(staleBefore));
      expect(claimed.map((a) => a.id)).not.toContain("fresh-app");
    });

    test("app whose only success run finished BEFORE staleBefore IS due", async () => {
      await apps.create({ id: "stale-app" });
      // Create a run and then manually set its finishedAt to a past date
      const runId = await syncRuns.start("stale-app");
      await syncRuns.finish(runId, {
        status: SyncStatus.Success,
        pagesFetched: 1,
        reviewsUpserted: 0,
      });
      // Back-date the finishedAt to well before staleBefore
      await db.execute(
        sql`UPDATE sync_runs SET finished_at = '2026-01-01T00:00:00Z' WHERE id = ${runId}`,
      );
      // staleBefore is after the run's finishedAt
      const staleBefore = new Date("2026-06-01T00:00:00Z");
      const claimed = await apps.claimDueForSync(claimOpts(staleBefore));
      expect(claimed.map((a) => a.id)).toContain("stale-app");
    });

    test("app with only an error run (no success) IS due", async () => {
      await apps.create({ id: "errored-app" });
      const runId = await syncRuns.start("errored-app");
      await syncRuns.finish(runId, {
        status: SyncStatus.Error,
        pagesFetched: 0,
        reviewsUpserted: 0,
        error: "network failure",
      });
      const staleBefore = new Date("2026-01-01T00:00:00Z");
      const claimed = await apps.claimDueForSync(claimOpts(staleBefore));
      expect(claimed.map((a) => a.id)).toContain("errored-app");
    });

    test("an already-claimed (fresh) app is NOT claimed again", async () => {
      await apps.create({ id: "busy-app" });
      const now = new Date();
      // First claim wins.
      const first = await apps.claimDueForSync(claimOpts(now, now));
      expect(first.map((a) => a.id)).toContain("busy-app");
      // A second claim moments later sees a fresh lease and skips it.
      const second = await apps.claimDueForSync(claimOpts(now, new Date(now.getTime() + 1000)));
      expect(second.map((a) => a.id)).not.toContain("busy-app");
    });

    test("a STUCK claim (older than claimExpiredBefore) IS reclaimed", async () => {
      await apps.create({ id: "stuck-app" });
      // Simulate a worker that claimed it long ago and died before releasing.
      await db.execute(
        sql`UPDATE apps SET claimed_at = '2026-01-01T00:00:00Z' WHERE id = 'stuck-app'`,
      );
      const now = new Date();
      const claimed = await apps.claimDueForSync(claimOpts(now, now));
      expect(claimed.map((a) => a.id)).toContain("stuck-app");
    });

    test("releaseClaim clears the lease so the app can be claimed again", async () => {
      await apps.create({ id: "release-app" });
      const now = new Date();
      await apps.claimDueForSync(claimOpts(now, now));
      expect((await apps.findById("release-app"))!.claimedAt).toBeInstanceOf(Date);

      await apps.releaseClaim("release-app");
      expect((await apps.findById("release-app"))!.claimedAt).toBeNull();

      // Eligible once more (still no successful run recorded).
      const claimedAgain = await apps.claimDueForSync(
        claimOpts(now, new Date(now.getTime() + 1000)),
      );
      expect(claimedAgain.map((a) => a.id)).toContain("release-app");
    });

    test("two concurrent claims never grab the same app", async () => {
      await apps.create({ id: "contended-app" });
      const now = new Date();
      const [a, b] = await Promise.all([
        apps.claimDueForSync(claimOpts(now, now)),
        apps.claimDueForSync(claimOpts(now, now)),
      ]);
      // Exactly one worker wins the row; the other gets nothing. No double-processing.
      expect(a.length + b.length).toBe(1);
    });
  });
});
