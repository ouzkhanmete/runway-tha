import type { App } from "../../domain/app";
import type { ReviewFeedClient } from "../ports/review-feed-client";
import type { ReviewRepository } from "../ports/review-repository";
import type { SyncRunRepository } from "../ports/sync-run-repository";

interface IngestReviewsDeps {
  feed: ReviewFeedClient;
  reviews: ReviewRepository;
  syncRuns: SyncRunRepository;
}

export class IngestReviewsService {
  constructor(private deps: IngestReviewsDeps) {}

  async ingestApp(app: App): Promise<{ pagesFetched: number; reviewsUpserted: number }> {
    const runId = await this.deps.syncRuns.start(app.id);
    try {
      const { reviews, pagesFetched } = await this.deps.feed.fetchAllPages(app.id, app.country);
      const reviewsUpserted = await this.deps.reviews.upsertMany(reviews);
      await this.deps.syncRuns.finish(runId, {
        status: "success",
        pagesFetched,
        reviewsUpserted,
      });
      return { pagesFetched, reviewsUpserted };
    } catch (err) {
      await this.deps.syncRuns.finish(runId, {
        status: "error",
        pagesFetched: 0,
        reviewsUpserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
