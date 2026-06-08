import type { ReviewFeedClient } from "@packages/core/application/api-clients/review-feed.api-client";
import type { ReviewRepository } from "@packages/core/application/repositories/review.repository";
import type { SyncRunRepository } from "@packages/core/application/repositories/sync-run.repository";
import type { App } from "@packages/core/domain/app";
import { SyncStatus } from "@packages/core/domain/sync-status";

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
        status: SyncStatus.Success,
        pagesFetched,
        reviewsUpserted,
      });
      return { pagesFetched, reviewsUpserted };
    } catch (err) {
      await this.deps.syncRuns.finish(runId, {
        status: SyncStatus.Error,
        pagesFetched: 0,
        reviewsUpserted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
