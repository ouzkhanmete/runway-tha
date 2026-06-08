import {
  loadEnv,
  createDb,
  DrizzleAppRepository,
  DrizzleReviewRepository,
  DrizzleSyncRunRepository,
  AppStoreFeedClient,
  IngestReviewsService,
  AppRegistryService,
  SyncSchedulerService,
} from "@runway/core";

export function buildWorker() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const appRepo = new DrizzleAppRepository(db);
  const reviewRepo = new DrizzleReviewRepository(db);
  const syncRunRepo = new DrizzleSyncRunRepository(db);

  const feedClient = new AppStoreFeedClient({
    fetch: globalThis.fetch,
    baseUrl: env.FEED_BASE_URL,
    maxPages: env.WORKER_MAX_PAGES,
    maxRetries: env.WORKER_MAX_RETRIES,
  });

  const ingest = new IngestReviewsService({
    feed: feedClient,
    reviews: reviewRepo,
    syncRuns: syncRunRepo,
  });

  const scheduler = new SyncSchedulerService({
    apps: appRepo,
    ingest,
    stalenessMin: env.WORKER_STALENESS_MIN,
    concurrency: env.WORKER_CONCURRENCY,
  });

  const registry = new AppRegistryService({ apps: appRepo });

  return { env, scheduler, registry };
}
