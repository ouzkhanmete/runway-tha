export interface SyncRun {
  id: number;
  appId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: "running" | "success" | "error";
  pagesFetched: number;
  reviewsUpserted: number;
  error: string | null;
}
