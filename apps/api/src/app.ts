import { Hono } from "hono";
import type { ReviewQueryService, AppRegistryService } from "@runway/core";
import type { ReviewsQuerySchemaType } from "@runway/shared";
import { errorHandler } from "./middleware/error";
import { registerHealthRoutes } from "./routes/health";
import { registerAppRoutes } from "./routes/apps";
import { registerReviewRoutes } from "./routes/reviews";

export interface ApiDeps {
  reviewQuery: ReviewQueryService;
  registry: AppRegistryService;
  /** Window-validation schema; built from env at the composition root. Falls back to the shared default. */
  reviewsQuerySchema?: ReviewsQuerySchemaType;
}

export function createApp(deps: ApiDeps): Hono {
  const app = new Hono();

  registerHealthRoutes(app, deps);
  registerAppRoutes(app, deps);
  registerReviewRoutes(app, deps);

  app.onError(errorHandler);

  return app;
}
