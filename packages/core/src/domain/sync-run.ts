import { SyncStatus } from "./sync-status";

export interface SyncRun {
  id: number;
  appId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: SyncStatus;
  pagesFetched: number;
  reviewsUpserted: number;
  error: string | null;
}
