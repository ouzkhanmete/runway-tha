import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import {
  DrizzleAppRepository,
  DrizzleReviewRepository,
  DrizzleSyncRunRepository,
  IngestReviewsService,
  ReviewQueryService,
  AppRegistryService,
} from "@runway/core";
import type { Review } from "@runway/core";
import { ReviewDtoSchema } from "@runway/shared";
import {
  getTestDb,
  ensureMigrated,
  truncateAll,
} from "../../node_modules/@runway/core/test/helpers/test-db";
import { createApp } from "../../src/app";

const db = getTestDb();
const appRepo = new DrizzleAppRepository(db);
const reviewRepo = new DrizzleReviewRepository(db);
const syncRunRepo = new DrizzleSyncRunRepository(db);
const registry = new AppRegistryService({ apps: appRepo });

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
    const registeredApp = await appRepo.create({ id: APP_ID, country: "us" });
    expect(registeredApp.id).toBe(APP_ID);

    // Ingest via fake feed
    const ingestService = new IngestReviewsService({
      feed: makeFakeFeed(FAKE_REVIEWS),
      reviews: reviewRepo,
      syncRuns: syncRunRepo,
    });
    const { reviewsUpserted } = await ingestService.ingestApp(registeredApp);
    expect(reviewsUpserted).toBe(FAKE_REVIEWS.length);

    // Query via Hono app with fixed clock at NOW so window math is deterministic
    const reviewQueryWithClock = new ReviewQueryService({
      reviews: reviewRepo,
      clock: () => NOW,
    });
    const testApp = createApp({
      reviewQuery: reviewQueryWithClock,
      registry,
    });

    const res = await testApp.request(`/apps/${APP_ID}/reviews?windowHours=720`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(FAKE_REVIEWS.length);

    // Each item must conform to ReviewDtoSchema
    for (const item of body) {
      expect(() => ReviewDtoSchema.parse(item)).not.toThrow();
      expect(typeof item.id).toBe("string");
      expect(typeof item.author).toBe("string");
      expect(typeof item.content).toBe("string");
      expect(typeof item.submittedAt).toBe("string");
      expect([1, 2, 3, 4, 5]).toContain(item.rating);
    }

    // Newest-first ordering
    const timestamps = body.map((r: { submittedAt: string }) =>
      new Date(r.submittedAt).getTime()
    );
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
    }

    // All our known IDs must appear
    const ids = body.map((r: { id: string }) => r.id);
    for (const review of FAKE_REVIEWS) {
      expect(ids).toContain(review.id);
    }
  });

  test("second ingestApp with identical reviews does NOT grow the row count (dedup / restart-safety)", async () => {
    const registeredApp = await appRepo.create({ id: APP_ID, country: "us" });

    const ingestService = new IngestReviewsService({
      feed: makeFakeFeed(FAKE_REVIEWS),
      reviews: reviewRepo,
      syncRuns: syncRunRepo,
    });

    // First ingest
    await ingestService.ingestApp(registeredApp);

    // Second ingest — same data, same feed
    await ingestService.ingestApp(registeredApp);

    // Row count must be the same as after the first ingest
    const reviewQueryWithClock = new ReviewQueryService({
      reviews: reviewRepo,
      clock: () => NOW,
    });
    const testApp = createApp({
      reviewQuery: reviewQueryWithClock,
      registry,
    });

    const res = await testApp.request(`/apps/${APP_ID}/reviews?windowHours=720`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveLength(FAKE_REVIEWS.length); // exactly the same count — no duplicates
  });
});
