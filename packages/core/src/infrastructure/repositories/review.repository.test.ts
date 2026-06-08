import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Country } from "@packages/shared/index";
import { sql } from "drizzle-orm";
import { makeReview } from "../../../test/helpers/fixtures";
import { ensureMigrated, getTestDb, truncateAll } from "../../../test/helpers/test-db";
import { DrizzleAppRepository as AppRepo } from "./app.repository";
import { DrizzleReviewRepository as ReviewRepo } from "./review.repository";

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
  return apps.create({ id: appId, country: Country.US });
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

  describe("findRecentPage", () => {
    const SINCE = new Date("2026-06-01T00:00:00Z");

    test("returns only rows with submittedAt >= since, newest-first", async () => {
      await seedApp();
      const old = makeReview({
        id: "old",
        appId: "595068606",
        submittedAt: new Date("2026-05-31T12:00:00Z"),
      });
      const recent1 = makeReview({
        id: "r1",
        appId: "595068606",
        submittedAt: new Date("2026-06-02T10:00:00Z"),
      });
      const recent2 = makeReview({
        id: "r2",
        appId: "595068606",
        submittedAt: new Date("2026-06-03T10:00:00Z"),
      });
      await reviews.upsertMany([old, recent1, recent2]);

      const page = await reviews.findRecentPage("595068606", SINCE, { limit: 10 });
      expect(page.items.map((r) => r.id)).toEqual(["r2", "r1"]); // newest first, old excluded
      expect(page.nextCursor).toBeNull(); // everything fit on one page
    });

    test("empty page when no reviews in window", async () => {
      await seedApp();
      const page = await reviews.findRecentPage("595068606", SINCE, { limit: 5 });
      expect(page.items).toHaveLength(0);
      expect(page.nextCursor).toBeNull();
    });

    test("submittedAt is a Date instance and rating is a number", async () => {
      await seedApp();
      await reviews.upsertMany([
        makeReview({
          id: "t1",
          appId: "595068606",
          rating: 3,
          submittedAt: new Date("2026-06-05T00:00:00Z"),
        }),
      ]);
      const page = await reviews.findRecentPage("595068606", SINCE, { limit: 5 });
      expect(page.items[0].submittedAt).toBeInstanceOf(Date);
      expect(typeof page.items[0].rating).toBe("number");
      expect(page.items[0].rating).toBe(3);
    });

    test("walks all reviews across pages via the cursor with no gaps or repeats", async () => {
      await seedApp();
      // 7 reviews, strictly descending timestamps p1 (newest) … p7 (oldest).
      const seeded = Array.from({ length: 7 }, (_, i) =>
        makeReview({
          id: `p${i + 1}`,
          appId: "595068606",
          submittedAt: new Date(`2026-06-07T${String(7 - i).padStart(2, "0")}:00:00Z`),
        }),
      );
      await reviews.upsertMany(seeded);

      const collected: string[] = [];
      let cursor = null as Awaited<ReturnType<typeof reviews.findRecentPage>>["nextCursor"];
      let pages = 0;
      do {
        const page = await reviews.findRecentPage("595068606", SINCE, { limit: 3, cursor });
        collected.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      // 3 pages: 3 + 3 + 1, in strict newest-first order, every id exactly once.
      expect(pages).toBe(3);
      expect(collected).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
    });

    test("breaks ties on id so equal timestamps paginate deterministically", async () => {
      await seedApp();
      const ts = new Date("2026-06-05T00:00:00Z");
      await reviews.upsertMany([
        makeReview({ id: "a", appId: "595068606", submittedAt: ts }),
        makeReview({ id: "b", appId: "595068606", submittedAt: ts }),
      ]);

      const page1 = await reviews.findRecentPage("595068606", SINCE, { limit: 1 });
      expect(page1.items.map((r) => r.id)).toEqual(["b"]); // id DESC breaks the tie
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await reviews.findRecentPage("595068606", SINCE, {
        limit: 1,
        cursor: page1.nextCursor,
      });
      expect(page2.items.map((r) => r.id)).toEqual(["a"]); // no skip, no repeat
      expect(page2.nextCursor).toBeNull();
    });
  });
});
