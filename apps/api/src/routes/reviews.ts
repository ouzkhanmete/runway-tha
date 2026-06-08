import type { Hono } from "hono";
import type { ReviewQueryService, AppRegistryService } from "@runway/core";
import { NotFoundError } from "@runway/core";
import { ReviewsQuerySchema } from "@runway/shared";
import { toReviewDto } from "../mappers/review-dto.mapper";

export interface ReviewsDeps {
  reviewQuery: ReviewQueryService;
  registry: AppRegistryService;
}

export function registerReviewRoutes(app: Hono, deps: ReviewsDeps): void {
  app.get("/apps/:appId/reviews", async (c) => {
    const appId = c.req.param("appId");
    const q = ReviewsQuerySchema.parse({ windowHours: c.req.query("windowHours") });

    const app = await deps.registry.get(appId);
    if (!app) {
      throw new NotFoundError(`App not found: ${appId}`);
    }

    const reviews = await deps.reviewQuery.getRecent(appId, q.windowHours);
    return c.json(reviews.map(toReviewDto));
  });
}
