import { describe, expect, test } from "bun:test";
import type {
  ReviewCursor,
  ReviewRepository,
} from "@packages/core/application/repositories/review.repository";
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
  test("computes since = clock() - windowHours and delegates limit + cursor to findRecentPage", async () => {
    const NOW = new Date("2026-06-08T12:00:00Z");
    const WINDOW_HOURS = 48;
    const expectedSince = new Date(NOW.getTime() - WINDOW_HOURS * 3600_000);

    const calls: Array<{ appId: string; since: Date; opts: unknown }> = [];
    const page = { items: [makeTestReview("r1", expectedSince)], nextCursor: null };

    const fakeReviews: ReviewRepository = {
      upsertMany: async () => 0,
      findRecentPage: async (appId, since, opts) => {
        calls.push({ appId, since, opts });
        return page;
      },
    };

    const service = new ReviewQueryService({ reviews: fakeReviews, clock: () => NOW });
    const cursor: ReviewCursor = { submittedAt: new Date("2026-06-07T00:00:00Z"), id: "x" };

    const result = await service.getRecentPage("595068606", WINDOW_HOURS, { limit: 5, cursor });

    expect(calls).toHaveLength(1);
    expect(calls[0].appId).toBe("595068606");
    expect(calls[0].since.getTime()).toBe(expectedSince.getTime());
    expect(calls[0].opts).toEqual({ limit: 5, cursor });
    expect(result).toEqual(page);
  });

  test("uses the default clock (now) when not injected", async () => {
    const before = Date.now();
    const capturedSince: Date[] = [];

    const fakeReviews: ReviewRepository = {
      upsertMany: async () => 0,
      findRecentPage: async (_appId, since) => {
        capturedSince.push(since);
        return { items: [], nextCursor: null };
      },
    };

    const service = new ReviewQueryService({ reviews: fakeReviews });
    await service.getRecentPage("app123", 24, { limit: 5 });
    const after = Date.now();

    expect(capturedSince).toHaveLength(1);
    const since = capturedSince[0].getTime();
    expect(since).toBeGreaterThanOrEqual(before - 24 * 3600_000);
    expect(since).toBeLessThanOrEqual(after - 24 * 3600_000 + 100);
  });

  test("returns an empty page when there are no reviews in the window", async () => {
    const fakeReviews: ReviewRepository = {
      upsertMany: async () => 0,
      findRecentPage: async () => ({ items: [], nextCursor: null }),
    };
    const service = new ReviewQueryService({ reviews: fakeReviews });
    const result = await service.getRecentPage("any-app", 48, { limit: 5 });
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});
