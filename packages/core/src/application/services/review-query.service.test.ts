import { describe, expect, test } from "bun:test";
import type { Review } from "@packages/core/domain/review";
import { ReviewQueryService } from "./review-query.service";

function makeTestReview(id: string, submittedAt: Date): Review {
  return {
    id,
    appId: "595068606",
    author: "Test",
    title: "Title",
    content: "Content",
    rating: 5,
    version: "1.0",
    submittedAt,
  };
}

describe("ReviewQueryService", () => {
  test("computes since = clock() - windowHours * 3600_000 and delegates to reviews.findRecent", async () => {
    const NOW = new Date("2026-06-08T12:00:00Z");
    const WINDOW_HOURS = 48;
    const expectedSince = new Date(NOW.getTime() - WINDOW_HOURS * 3600_000);

    const capturedCalls: Array<{ appId: string; since: Date }> = [];
    const returnedReviews = [makeTestReview("r1", expectedSince)];

    const fakeReviews = {
      upsertMany: async () => 0,
      findRecent: async (appId: string, since: Date) => {
        capturedCalls.push({ appId, since });
        return returnedReviews;
      },
    };

    const service = new ReviewQueryService({
      reviews: fakeReviews,
      clock: () => NOW,
    });

    const result = await service.getRecent("595068606", WINDOW_HOURS);

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].appId).toBe("595068606");
    expect(capturedCalls[0].since.getTime()).toBe(expectedSince.getTime());
    expect(result).toEqual(returnedReviews);
  });

  test("uses default clock (Date.now) when not injected", async () => {
    const before = Date.now();
    const capturedSince: Date[] = [];

    const fakeReviews = {
      upsertMany: async () => 0,
      findRecent: async (_appId: string, since: Date) => {
        capturedSince.push(since);
        return [];
      },
    };

    const service = new ReviewQueryService({ reviews: fakeReviews });
    await service.getRecent("app123", 24);
    const after = Date.now();

    expect(capturedSince).toHaveLength(1);
    const since = capturedSince[0].getTime();
    // since = now - 24*3600_000; check it's approximately in range
    expect(since).toBeGreaterThanOrEqual(before - 24 * 3600_000);
    expect(since).toBeLessThanOrEqual(after - 24 * 3600_000 + 100);
  });

  test("returns empty array when no reviews in window", async () => {
    const fakeReviews = {
      upsertMany: async () => 0,
      findRecent: async () => [],
    };
    const service = new ReviewQueryService({ reviews: fakeReviews });
    const result = await service.getRecent("any-app", 48);
    expect(result).toHaveLength(0);
  });
});
