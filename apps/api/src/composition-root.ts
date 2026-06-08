import {
  loadEnv,
  createDb,
  DrizzleAppRepository,
  DrizzleReviewRepository,
  ReviewQueryService,
  AppRegistryService,
} from "@runway/core";
import type { ApiDeps } from "./app";

export function buildApi(): { env: ReturnType<typeof loadEnv>; deps: ApiDeps } {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const appRepo = new DrizzleAppRepository(db);
  const reviewRepo = new DrizzleReviewRepository(db);

  const reviewQuery = new ReviewQueryService({ reviews: reviewRepo });
  const registry = new AppRegistryService({ apps: appRepo });

  return {
    env,
    deps: { reviewQuery, registry },
  };
}
