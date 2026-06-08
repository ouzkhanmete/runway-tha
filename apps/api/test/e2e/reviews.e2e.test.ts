import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AppRegistryService, createRepositories, ReviewQueryService } from "@packages/core/index";
import { Country, makeReviewsQuerySchema, ReviewDtoSchema } from "@packages/shared/index";
import {
  ensureMigrated,
  getTestDb,
  truncateAll,
} from "../../../../packages/core/test/helpers/test-db";
import { createApp } from "../../src/app";

const db = getTestDb();
const repos = createRepositories(db);
const reviewQuery = new ReviewQueryService({ reviews: repos.reviews });
const registry = new AppRegistryService({ apps: repos.apps });
const reviewsQuerySchema = makeReviewsQuerySchema(48);
const app = createApp({ reviewQuery, registry, reviewsQuerySchema });

const APP_ID = "595068606";
const NOW = new Date("2026-06-08T12:00:00Z");

beforeAll(ensureMigrated);
beforeEach(() => truncateAll(db));

async function seedApp() {
  return repos.apps.create({ id: APP_ID, country: Country.US });
}

function appWithClock(now: Date) {
  const reviewQueryWithClock = new ReviewQueryService({ reviews: repos.reviews, clock: () => now });
  return createApp({
    reviewQuery: reviewQueryWithClock,
    registry: new AppRegistryService({ apps: repos.apps }),
    reviewsQuerySchema,
  });
}

/** Seed `n` in-window reviews (within 720h of NOW), strictly newest-first by id m1…mn. */
async function seedManyReviews(n: number) {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `m${i + 1}`,
    appId: APP_ID,
    author: `Author ${i + 1}`,
    title: `Review ${i + 1}`,
    content: "body",
    rating: 5 as const,
    version: "1.0",
    submittedAt: new Date(NOW.getTime() - (i + 1) * 3600_000), // i+1 hours before NOW
  }));
  await repos.reviews.upsertMany(items);
  return items;
}

async function seedReviews() {
  // In-window (within 48h from NOW)
  const inWindow = [
    {
      id: "r1",
      appId: APP_ID,
      author: "Alice",
      title: "Great app",
      content: "Really love it",
      rating: 5 as const,
      version: "2.0",
      submittedAt: new Date("2026-06-08T10:00:00Z"), // 2h ago
    },
    {
      id: "r2",
      appId: APP_ID,
      author: "Bob",
      title: "Pretty good",
      content: "Works well",
      rating: 4 as const,
      version: "2.0",
      submittedAt: new Date("2026-06-07T12:00:00Z"), // 24h ago
    },
  ];
  // Out-of-window (older than 48h from NOW)
  const outOfWindow = [
    {
      id: "r3",
      appId: APP_ID,
      author: "Charlie",
      title: "Old review",
      content: "This is old",
      rating: 3 as const,
      version: "1.0",
      submittedAt: new Date("2026-06-05T12:00:00Z"), // 72h ago
    },
  ];
  await repos.reviews.upsertMany([...inWindow, ...outOfWindow]);
  return { inWindow, outOfWindow };
}

describe("GET /apps/:appId/reviews", () => {
  test("200 returns a page of in-window reviews, newest-first, valid ReviewDtos", async () => {
    await seedApp();
    const { inWindow } = await seedReviews();

    // Fixed clock so we know exactly what's "within 48h"
    const res = await appWithClock(NOW).request(`/apps/${APP_ID}/reviews?windowHours=48`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(inWindow.length);
    expect(body.nextCursor).toBeNull(); // 2 items fit on the default 5-item page

    for (const item of body.items) {
      expect(() => ReviewDtoSchema.parse(item)).not.toThrow();
    }

    // Newest-first ordering
    const dates = body.items.map((r: { submittedAt: string }) => new Date(r.submittedAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }

    const ids = body.items.map((r: { id: string }) => r.id);
    expect(ids).not.toContain("r3"); // out-of-window
    expect(ids).toContain("r1");
    expect(ids).toContain("r2");
  });

  test("paginates with the cursor: a full page then the remainder, no overlap", async () => {
    await seedApp();
    await seedManyReviews(7);
    const appFixed = appWithClock(NOW);

    const res1 = await appFixed.request(`/apps/${APP_ID}/reviews?windowHours=720`);
    const page1 = await res1.json();
    expect(page1.items).toHaveLength(5); // default page size
    expect(page1.nextCursor).not.toBeNull();

    const res2 = await appFixed.request(
      `/apps/${APP_ID}/reviews?windowHours=720&cursor=${encodeURIComponent(page1.nextCursor)}`,
    );
    const page2 = await res2.json();
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();

    const ids1 = page1.items.map((r: { id: string }) => r.id);
    const ids2 = page2.items.map((r: { id: string }) => r.id);
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0); // disjoint pages
    expect([...ids1, ...ids2]).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7"]); // full, in order
  });

  test("respects an explicit limit", async () => {
    await seedApp();
    await seedManyReviews(7);
    const res = await appWithClock(NOW).request(`/apps/${APP_ID}/reviews?windowHours=720&limit=3`);
    const page = await res.json();
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();
  });

  test("400 when windowHours is out of range", async () => {
    await seedApp();
    const res = await app.request(`/apps/${APP_ID}/reviews?windowHours=99999`);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });

  test("400 when the cursor is malformed", async () => {
    await seedApp();
    const res = await app.request(
      `/apps/${APP_ID}/reviews?windowHours=48&cursor=not-a-real-cursor`,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });

  test("404 for unregistered app", async () => {
    const res = await app.request("/apps/999999999/reviews?windowHours=48");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  test("200 with an empty page when the app has no reviews", async () => {
    await seedApp();
    const res = await app.request(`/apps/${APP_ID}/reviews?windowHours=48`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });
});
