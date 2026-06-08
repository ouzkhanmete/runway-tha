export interface SyncRunRepository {
  start(appId: string): Promise<number>; // returns run id
  finish(
    id: number,
    r: {
      status: "success" | "error";
      pagesFetched: number;
      reviewsUpserted: number;
      error?: string;
    }
  ): Promise<void>;
}
