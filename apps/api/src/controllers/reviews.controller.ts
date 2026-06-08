import type { AppRegistryService, ReviewQueryService } from "@packages/core/index";
import { NotFoundError } from "@packages/core/index";
import type { ReviewsQuerySchemaType } from "@packages/shared/index";
import type { Context, Hono } from "hono";
import { toReviewDto } from "../mappers/review-dto.mapper";

export interface ReviewsDeps {
  reviewQuery: ReviewQueryService;
  registry: AppRegistryService;
  reviewsQuerySchema: ReviewsQuerySchemaType;
}

export class ReviewsController {
  private readonly reviewQuery: ReviewQueryService;
  private readonly registry: AppRegistryService;
  private readonly reviewsQuerySchema: ReviewsQuerySchemaType;

  constructor(deps: ReviewsDeps) {
    this.reviewQuery = deps.reviewQuery;
    this.registry = deps.registry;
    this.reviewsQuerySchema = deps.reviewsQuerySchema;
  }

  routes(app: Hono): void {
    app.get("/apps/:appId/reviews", (c) => this.getRecent(c));
  }

  private async getRecent(c: Context) {
    const appId = c.req.param("appId");
    const q = this.reviewsQuerySchema.parse({ windowHours: c.req.query("windowHours") });

    const app = await this.registry.get(appId);
    if (!app) {
      throw new NotFoundError(`App not found: ${appId}`);
    }

    const reviews = await this.reviewQuery.getRecent(appId, q.windowHours);
    return c.json(reviews.map(toReviewDto));
  }
}
