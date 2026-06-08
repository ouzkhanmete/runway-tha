import { describe, test, expect } from "bun:test";
import { IngestReviewsService } from "../../src/application/services/ingest-reviews.service";
import type { App } from "../../src/domain/app";
import type { Review } from "../../src/domain/review";

function makeApp(overrides: Partial<App> = {}): App {
  return {
    id: "595068606",
    name: "TestApp",
    country: "us",
    createdAt: new Date(),
    ...overrides,
  };
}

function makeTestReview(id: string): Review {
  return {
    id,
    appId: "595068606",
    author: "Test",
    title: "Title",
    content: "Content",
    rating: 5,
    version: "1.0",
    submittedAt: new Date(),
  };
}

describe("IngestReviewsService", () => {
  test("calls feed, upsertMany, and records a success run with counts", async () => {
    const reviews = makeTestReview("r1");
    const feedCalls: string[] = [];
    const upsertCalls: Review[][] = [];
    const startCalls: string[] = [];
    const finishCalls: Array<{ id: number; r: any }> = [];

    const fakeFeed = {
      fetchAllPages: async (appId: string, country: string) => {
        feedCalls.push(`${appId}:${country}`);
        return { reviews: [reviews], pagesFetched: 3 };
      },
    };
    const fakeReviews = {
      upsertMany: async (items: Review[]) => {
        upsertCalls.push(items);
        return items.length;
      },
      findRecent: async () => [],
    };
    const fakeSyncRuns = {
      start: async (appId: string) => {
        startCalls.push(appId);
        return 42;
      },
      finish: async (id: number, r: any) => {
        finishCalls.push({ id, r });
      },
    };

    const service = new IngestReviewsService({
      feed: fakeFeed,
      reviews: fakeReviews,
      syncRuns: fakeSyncRuns,
    });

    const app = makeApp();
    const result = await service.ingestApp(app);

    expect(feedCalls).toEqual(["595068606:us"]);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toHaveLength(1);
    expect(startCalls).toEqual(["595068606"]);
    expect(finishCalls).toHaveLength(1);
    expect(finishCalls[0].id).toBe(42);
    expect(finishCalls[0].r.status).toBe("success");
    expect(finishCalls[0].r.pagesFetched).toBe(3);
    expect(finishCalls[0].r.reviewsUpserted).toBe(1);
    expect(result.pagesFetched).toBe(3);
    expect(result.reviewsUpserted).toBe(1);
  });

  test("records an error run and rethrows when feed throws", async () => {
    const startCalls: string[] = [];
    const finishCalls: Array<{ id: number; r: any }> = [];

    const fakeFeed = {
      fetchAllPages: async () => {
        throw new Error("network error");
      },
    };
    const fakeReviews = {
      upsertMany: async () => 0,
      findRecent: async () => [],
    };
    const fakeSyncRuns = {
      start: async (appId: string) => {
        startCalls.push(appId);
        return 99;
      },
      finish: async (id: number, r: any) => {
        finishCalls.push({ id, r });
      },
    };

    const service = new IngestReviewsService({
      feed: fakeFeed,
      reviews: fakeReviews,
      syncRuns: fakeSyncRuns,
    });

    const app = makeApp();
    await expect(service.ingestApp(app)).rejects.toThrow("network error");

    expect(startCalls).toEqual(["595068606"]);
    expect(finishCalls).toHaveLength(1);
    expect(finishCalls[0].id).toBe(99);
    expect(finishCalls[0].r.status).toBe("error");
    expect(finishCalls[0].r.error).toBe("network error");
  });

  test("records error run even when upsertMany fails", async () => {
    const finishCalls: Array<{ id: number; r: any }> = [];

    const fakeFeed = {
      fetchAllPages: async () => ({ reviews: [makeTestReview("x")], pagesFetched: 1 }),
    };
    const fakeReviews = {
      upsertMany: async () => { throw new Error("db error"); },
      findRecent: async () => [],
    };
    const fakeSyncRuns = {
      start: async () => 1,
      finish: async (id: number, r: any) => { finishCalls.push({ id, r }); },
    };

    const service = new IngestReviewsService({
      feed: fakeFeed,
      reviews: fakeReviews,
      syncRuns: fakeSyncRuns,
    });

    await expect(service.ingestApp(makeApp())).rejects.toThrow("db error");
    expect(finishCalls[0].r.status).toBe("error");
  });
});
