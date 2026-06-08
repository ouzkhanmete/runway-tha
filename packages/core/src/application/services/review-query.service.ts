import type { ReviewRepository } from "@packages/core/application/repositories/review.repository";
import type { Review } from "@packages/core/domain/review";
import { subHours } from "date-fns";

interface ReviewQueryDeps {
  reviews: ReviewRepository;
  clock?: () => Date;
}

export class ReviewQueryService {
  private readonly clock: () => Date;

  constructor(private deps: ReviewQueryDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async getRecent(appId: string, windowHours: number): Promise<Review[]> {
    const now = this.clock();
    const since = subHours(now, windowHours);
    return this.deps.reviews.findRecent(appId, since);
  }
}
