import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { ReviewRepository } from "@packages/core/application/repositories/review.repository";
import type { SyncRunRepository } from "@packages/core/application/repositories/sync-run.repository";
import type { Db } from "../db/client";
import { DrizzleAppRepository } from "./app.repository";
import { DrizzleReviewRepository } from "./review.repository";
import { DrizzleSyncRunRepository } from "./sync-run.repository";

export function createRepositories(db: Db) {
  return {
    reviews: new DrizzleReviewRepository(db) as ReviewRepository,
    apps: new DrizzleAppRepository(db) as AppRepository,
    syncRuns: new DrizzleSyncRunRepository(db) as SyncRunRepository,
  } as const;
}

export type Repositories = ReturnType<typeof createRepositories>;
