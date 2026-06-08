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
  test("200 returns only in-window reviews, newest-first, valid ReviewDtos", async () => {
    await seedApp();
    const { inWindow } = await seedReviews();

    // Use a fixed clock so we know exactly what's "within 48h"
    const reviewQueryWithClock = new ReviewQueryService({
      reviews: repos.reviews,
      clock: () => NOW,
    });
    const registryFixed = new AppRegistryService({ apps: repos.apps });
    const appFixed = createApp({
      reviewQuery: reviewQueryWithClock,
      registry: registryFixed,
      reviewsQuerySchema,
    });

    const res = await appFixed.request(`/apps/${APP_ID}/reviews?windowHours=48`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(inWindow.length);

    // Validate each item against schema
    for (const item of body) {
      expect(() => ReviewDtoSchema.parse(item)).not.toThrow();
      expect(typeof item.content).toBe("string");
      expect(typeof item.author).toBe("string");
      expect(typeof item.submittedAt).toBe("string");
      expect([1, 2, 3, 4, 5]).toContain(item.rating);
    }

    // Verify newest-first ordering
    const dates = body.map((r: { submittedAt: string }) => new Date(r.submittedAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }

    // Verify the old review is not included
    const ids = body.map((r: { id: string }) => r.id);
    expect(ids).not.toContain("r3");
    expect(ids).toContain("r1");
    expect(ids).toContain("r2");
  });

  test("400 when windowHours is unsupported value", async () => {
    await seedApp();

    const res = await app.request(`/apps/${APP_ID}/reviews?windowHours=999`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  test("404 for unregistered app", async () => {
    const res = await app.request("/apps/999999999/reviews?windowHours=48");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("200 with empty array when app has no reviews", async () => {
    await seedApp();

    const res = await app.request(`/apps/${APP_ID}/reviews?windowHours=48`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
