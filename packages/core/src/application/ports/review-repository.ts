import type { Review } from "../../domain/review";

export interface ReviewRepository {
  upsertMany(reviews: Review[]): Promise<number>; // returns count processed
  findRecent(appId: string, since: Date): Promise<Review[]>; // submittedAt DESC
}
