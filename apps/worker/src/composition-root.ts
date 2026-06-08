import {
  AppleRssApiClient,
  createDb,
  createRepositories,
  IngestReviewsService,
  ItunesLookupApiClient,
  loadEnv,
  SyncSchedulerService,
} from "@packages/core/index";

export function buildWorker() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const repos = createRepositories(db);

  const feed = new AppleRssApiClient({
    fetch: globalThis.fetch,
    baseUrl: env.FEED_BASE_URL,
    maxPages: env.WORKER_MAX_PAGES,
    maxRetries: env.WORKER_MAX_RETRIES,
  });

  const ingest = new IngestReviewsService({
    feed,
    reviews: repos.reviews,
    syncRuns: repos.syncRuns,
  });

  // The reviews feed has no app name; the worker backfills it from the lookup API.
  const appMetadata = new ItunesLookupApiClient({
    fetch: globalThis.fetch,
    baseUrl: env.FEED_BASE_URL,
  });

  const scheduler = new SyncSchedulerService({
    apps: repos.apps,
    ingest,
    appMetadata,
    stalenessMs: env.WORKER_STALENESS_MS,
    claimTtlMs: env.WORKER_CLAIM_TTL_MS,
    concurrency: env.WORKER_CONCURRENCY,
  });

  return { env, scheduler };
}
