import {
  AppRegistryService,
  createDb,
  createRepositories,
  ItunesLookupApiClient,
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
  // The reviews feed has no app name and can't validate existence; the iTunes
  // lookup API does both synchronously at registration time.
  const appMetadata = new ItunesLookupApiClient({
    fetch: globalThis.fetch,
    baseUrl: env.FEED_BASE_URL,
  });
  const registry = new AppRegistryService({ apps: repos.apps, appMetadata });

  const reviewsQuerySchema = makeReviewsQuerySchema(env.REVIEW_WINDOW_HOURS_DEFAULT);

  return {
    env,
    deps: { reviewQuery, registry, reviewsQuerySchema },
  };
}
