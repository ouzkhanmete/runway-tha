import type { Review } from "@packages/core/domain/review";

export interface ReviewRepository {
  upsertMany(reviews: Review[]): Promise<number>; // returns count processed
  findRecent(appId: string, since: Date): Promise<Review[]>; // submittedAt DESC
}
