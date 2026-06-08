import type { Review } from "@packages/core/domain/review";

export interface ReviewFeedClient {
  fetchAllPages(
    appId: string,
    country: string,
  ): Promise<{ reviews: Review[]; pagesFetched: number }>;
}
