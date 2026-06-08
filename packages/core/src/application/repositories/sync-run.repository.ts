import type { SyncStatus } from "@packages/core/domain/sync-status";

export interface SyncRunRepository {
  start(appId: string): Promise<number>; // returns run id
  finish(
    id: number,
    r: {
      status: SyncStatus;
      pagesFetched: number;
      reviewsUpserted: number;
      error?: string;
    },
  ): Promise<void>;
}
