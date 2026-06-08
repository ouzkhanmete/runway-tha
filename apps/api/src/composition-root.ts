import {
  AppRegistryService,
  createDb,
  createRepositories,
  loadEnv,
  ReviewQueryService,
} from "@packages/core/index";
import { makeReviewsQuerySchema } from "@packages/shared/index";
import type { ApiDeps } from "./app";

export function buildApi(): { env: ReturnType<typeof loadEnv>; deps: ApiDeps } {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const repos = createRepositories(db);

  const reviewQuery = new ReviewQueryService({ reviews: repos.reviews });
  const registry = new AppRegistryService({ apps: repos.apps });

  const reviewsQuerySchema = makeReviewsQuerySchema(env.REVIEW_WINDOW_HOURS_DEFAULT);

  return {
    env,
    deps: { reviewQuery, registry, reviewsQuerySchema },
  };
}
