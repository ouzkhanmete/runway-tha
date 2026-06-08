import type { Review } from "../../domain/review";

export interface ReviewFeedClient {
  fetchAllPages(
    appId: string,
    country: string
  ): Promise<{ reviews: Review[]; pagesFetched: number }>;
}
