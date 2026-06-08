import type { AppRegistryService, ReviewQueryService } from "@packages/core/index";
import type { ReviewsQuerySchemaType } from "@packages/shared/index";
import { Hono } from "hono";
import { AppsController } from "./controllers/apps.controller";
import { HealthController } from "./controllers/health.controller";
import { ReviewsController } from "./controllers/reviews.controller";
import { errorHandler } from "./middleware/error";

export interface ApiDeps {
  reviewQuery: ReviewQueryService;
  registry: AppRegistryService;
  /** Window-validation schema; built from env at the composition root. */
  reviewsQuerySchema: ReviewsQuerySchemaType;
}

export function createApp(deps: ApiDeps): Hono {
  const app = new Hono();

  new HealthController().routes(app);
  new AppsController({ registry: deps.registry }).routes(app);
  new ReviewsController({
    reviewQuery: deps.reviewQuery,
    registry: deps.registry,
    reviewsQuerySchema: deps.reviewsQuerySchema,
  }).routes(app);

  app.onError(errorHandler);

  return app;
}
