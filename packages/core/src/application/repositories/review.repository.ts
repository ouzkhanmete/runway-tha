import type { Review } from "@packages/core/domain/review";

/** Keyset cursor: the (submittedAt, id) of the last review on a page. */
export interface ReviewCursor {
  submittedAt: Date;
  id: string;
}

/** One page of reviews plus the cursor for the next page (null when exhausted). */
export interface ReviewsPage {
  items: Review[];
  nextCursor: ReviewCursor | null;
}

export interface ReviewRepository {
  upsertMany(reviews: Review[]): Promise<number>; // returns count processed

  /**
   * One page of reviews for `appId` with `submittedAt >= since`, newest-first
   * (`submittedAt DESC, id DESC`). When `cursor` is provided, returns the reviews
   * strictly after it (keyset pagination). At most `limit` items are returned;
   * `nextCursor` is non-null only when more reviews remain.
   */
  findRecentPage(
    appId: string,
    since: Date,
    opts: { limit: number; cursor?: ReviewCursor | null },
  ): Promise<ReviewsPage>;
}
