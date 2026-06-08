import {
  loadEnv,
  createDb,
  DrizzleAppRepository,
  DrizzleReviewRepository,
  ReviewQueryService,
  AppRegistryService,
} from "@runway/core";
import { makeReviewsQuerySchema } from "@runway/shared";
import type { ApiDeps } from "./app";

export function buildApi(): { env: ReturnType<typeof loadEnv>; deps: ApiDeps } {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const appRepo = new DrizzleAppRepository(db);
  const reviewRepo = new DrizzleReviewRepository(db);

  const reviewQuery = new ReviewQueryService({ reviews: reviewRepo });
  const registry = new AppRegistryService({ apps: appRepo });

  // The window allow-list is configurable via env (REVIEW_WINDOW_HOURS_*).
  const reviewsQuerySchema = makeReviewsQuerySchema(
    env.REVIEW_WINDOW_HOURS_ALLOWED,
    env.REVIEW_WINDOW_HOURS_DEFAULT,
  );

  return {
    env,
    deps: { reviewQuery, registry, reviewsQuerySchema },
  };
}
