import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Review } from "@packages/core/index";
import {
  AppRegistryService,
  createRepositories,
  IngestReviewsService,
  ReviewQueryService,
} from "@packages/core/index";
import { Country, makeReviewsQuerySchema, ReviewDtoSchema } from "@packages/shared/index";
import {
  ensureMigrated,
  getTestDb,
  truncateAll,
} from "../../../../packages/core/test/helpers/test-db";
import { createApp } from "../../src/app";

const db = getTestDb();
const repos = createRepositories(db);
const registry = new AppRegistryService({ apps: repos.apps });
const reviewsQuerySchema = makeReviewsQuerySchema(48);

const APP_ID = "888888001";
const NOW = new Date("2026-06-08T12:00:00Z");

// Reviews with varied submittedAt — all within a 720-hour window from NOW
const FAKE_REVIEWS: Review[] = [
  {
    id: "ff-r1",
    appId: APP_ID,
    author: "Alice",
    title: "Best app ever",
    content: "Absolutely love it",
    rating: 5,
    version: "3.0",
    submittedAt: new Date("2026-06-08T10:00:00Z"), // 2h ago
  },
  {
    id: "ff-r2",
    appId: APP_ID,
    author: "Bob",
    title: "Pretty solid",
    content: "Works great",
    rating: 4,
    version: "3.0",
    submittedAt: new Date("2026-06-07T12:00:00Z"), // 24h ago
  },
  {
    id: "ff-r3",
    appId: APP_ID,
    author: "Charlie",
    title: "Not bad",
    content: "Gets the job done",
    rating: 3,
    version: "2.5",
    submittedAt: new Date("2026-06-04T12:00:00Z"), // ~96h ago, still within 720h
  },
];

function makeFakeFeed(reviews: Review[]) {
  return {
    fetchAllPages: async (_appId: string, _country: string) => ({
      reviews,
      pagesFetched: 1,
    }),
  };
}

beforeAll(ensureMigrated);
beforeEach(() => truncateAll(db));

describe("full-flow e2e: feed → DB → API", () => {
  test("ingestApp → GET /apps/:id/reviews?windowHours=720 returns ingested reviews newest-first", async () => {
    // Register app
    const registeredApp = await repos.apps.create({ id: APP_ID, country: Country.US });
    expect(registeredApp.id).toBe(APP_ID);

    // Ingest via fake feed
    const ingestService = new IngestReviewsService({
      feed: makeFakeFeed(FAKE_REVIEWS),
      reviews: repos.reviews,
      syncRuns: repos.syncRuns,
    });
    const { reviewsUpserted } = await ingestService.ingestApp(registeredApp);
    expect(reviewsUpserted).toBe(FAKE_REVIEWS.length);

    // Query via Hono app with fixed clock at NOW so window math is deterministic
    const reviewQueryWithClock = new ReviewQueryService({
      reviews: repos.reviews,
      clock: () => NOW,
    });
    const testApp = createApp({
      reviewQuery: reviewQueryWithClock,
      registry,
      reviewsQuerySchema,
    });

    const res = await testApp.request(`/apps/${APP_ID}/reviews?windowHours=720`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(FAKE_REVIEWS.length);
    expect(body.nextCursor).toBeNull(); // 3 reviews fit on the default 5-item page

    // Each item must conform to ReviewDtoSchema
    for (const item of body.items) {
      expect(() => ReviewDtoSchema.parse(item)).not.toThrow();
      expect(typeof item.id).toBe("string");
      expect(typeof item.author).toBe("string");
      expect(typeof item.content).toBe("string");
      expect(typeof item.submittedAt).toBe("string");
      expect([1, 2, 3, 4, 5]).toContain(item.rating);
    }

    // Newest-first ordering
    const timestamps = body.items.map((r: { submittedAt: string }) =>
      new Date(r.submittedAt).getTime(),
    );
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
    }

    // All our known IDs must appear
    const ids = body.items.map((r: { id: string }) => r.id);
    for (const review of FAKE_REVIEWS) {
      expect(ids).toContain(review.id);
    }
  });

  test("second ingestApp with identical reviews does NOT grow the row count (dedup / restart-safety)", async () => {
    const registeredApp = await repos.apps.create({ id: APP_ID, country: Country.US });

    const ingestService = new IngestReviewsService({
      feed: makeFakeFeed(FAKE_REVIEWS),
      reviews: repos.reviews,
      syncRuns: repos.syncRuns,
    });

    // First ingest
    await ingestService.ingestApp(registeredApp);

    // Second ingest — same data, same feed
    await ingestService.ingestApp(registeredApp);

    // Row count must be the same as after the first ingest
    const reviewQueryWithClock = new ReviewQueryService({
      reviews: repos.reviews,
      clock: () => NOW,
    });
    const testApp = createApp({
      reviewQuery: reviewQueryWithClock,
      registry,
      reviewsQuerySchema,
    });

    const res = await testApp.request(`/apps/${APP_ID}/reviews?windowHours=720`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(FAKE_REVIEWS.length); // exactly the same count — no duplicates
  });
});
