import type { Review } from "../../domain/review";
import type { ReviewRepository } from "../ports/review-repository";

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
    const since = new Date(now.getTime() - windowHours * 3_600_000);
    return this.deps.reviews.findRecent(appId, since);
  }
}
