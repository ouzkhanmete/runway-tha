import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { sql } from "drizzle-orm";
import { ensureMigrated, getTestDb, truncateAll } from "../helpers/test-db";
import { DrizzleReviewRepository as ReviewRepo } from "../../src/infrastructure/repositories/review.repository";
import { DrizzleAppRepository as AppRepo } from "../../src/infrastructure/repositories/app.repository";
import { makeReview } from "../helpers/fixtures";

const db = getTestDb();
const reviews = new ReviewRepo(db);
const apps = new AppRepo(db);

beforeAll(async () => {
  await ensureMigrated();
});

beforeEach(async () => {
  await truncateAll(db);
});

async function seedApp(appId = "595068606") {
  return apps.create({ id: appId, country: "us" });
}

describe("ReviewRepository", () => {
  describe("upsertMany", () => {
    test("inserts reviews and returns count", async () => {
      await seedApp();
      const r1 = makeReview({ id: "r1", appId: "595068606" });
      const r2 = makeReview({ id: "r2", appId: "595068606" });
      const count = await reviews.upsertMany([r1, r2]);
      expect(count).toBe(2);
      const rows = await db.execute(sql`SELECT count(*)::int AS n FROM reviews`);
      expect((rows[0] as any).n).toBe(2);
    });

    test("idempotent upsert: same id twice → exactly 1 row", async () => {
      await seedApp();
      const r = makeReview({ id: "same-id", appId: "595068606" });
      await reviews.upsertMany([r]);
      await reviews.upsertMany([r]);
      const rows = await db.execute(sql`SELECT count(*)::int AS n FROM reviews`);
      expect((rows[0] as any).n).toBe(1);
    });

    test("re-upsert with changed content updates the row", async () => {
      await seedApp();
      const r = makeReview({ id: "upd-id", appId: "595068606", content: "original" });
      await reviews.upsertMany([r]);
      const updated = { ...r, content: "updated content" };
      await reviews.upsertMany([updated]);
      const rows = await db.execute(sql`SELECT content FROM reviews WHERE id = 'upd-id'`);
      expect((rows[0] as any).content).toBe("updated content");
    });

    test("handles empty array gracefully", async () => {
      const count = await reviews.upsertMany([]);
      expect(count).toBe(0);
    });
  });

  describe("findRecent", () => {
    test("returns only rows with submittedAt >= since, ordered newest-first", async () => {
      await seedApp();
      const since = new Date("2026-06-01T00:00:00Z");
      const old = makeReview({ id: "old", appId: "595068606", submittedAt: new Date("2026-05-31T12:00:00Z") });
      const recent1 = makeReview({ id: "r1", appId: "595068606", submittedAt: new Date("2026-06-02T10:00:00Z") });
      const recent2 = makeReview({ id: "r2", appId: "595068606", submittedAt: new Date("2026-06-03T10:00:00Z") });
      await reviews.upsertMany([old, recent1, recent2]);

      const result = await reviews.findRecent("595068606", since);
      expect(result).toHaveLength(2);
      // Newest first
      expect(result[0].id).toBe("r2");
      expect(result[1].id).toBe("r1");
    });

    test("returns empty array when no reviews in window", async () => {
      await seedApp();
      const result = await reviews.findRecent("595068606", new Date("2026-06-01T00:00:00Z"));
      expect(result).toHaveLength(0);
    });

    test("submittedAt is a Date instance", async () => {
      await seedApp();
      const r = makeReview({ id: "date-test", appId: "595068606", submittedAt: new Date("2026-06-05T00:00:00Z") });
      await reviews.upsertMany([r]);
      const result = await reviews.findRecent("595068606", new Date("2026-06-04T00:00:00Z"));
      expect(result[0].submittedAt).toBeInstanceOf(Date);
    });

    test("rating is cast to number", async () => {
      await seedApp();
      const r = makeReview({ id: "rating-test", appId: "595068606", rating: 3 });
      await reviews.upsertMany([r]);
      const result = await reviews.findRecent("595068606", new Date("2020-01-01T00:00:00Z"));
      expect(typeof result[0].rating).toBe("number");
      expect(result[0].rating).toBe(3);
    });
  });
});
