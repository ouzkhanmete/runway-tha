import type {
  ReviewCursor,
  ReviewRepository,
  ReviewsPage,
} from "@packages/core/application/repositories/review.repository";
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

  /** One page of recent reviews within `windowHours`, keyset-paginated by `cursor`. */
  async getRecentPage(
    appId: string,
    windowHours: number,
    opts: { limit: number; cursor?: ReviewCursor | null },
  ): Promise<ReviewsPage> {
    const now = this.clock();
    const since = subHours(now, windowHours);
    return this.deps.reviews.findRecentPage(appId, since, opts);
  }
}
