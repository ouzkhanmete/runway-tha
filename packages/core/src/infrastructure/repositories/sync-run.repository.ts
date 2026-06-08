import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import type { SyncRunRepository } from "../../application/ports/sync-run-repository";

const { syncRuns } = schema;

export class DrizzleSyncRunRepository implements SyncRunRepository {
  constructor(private db: Db) {}

  async start(appId: string): Promise<number> {
    const rows = await this.db
      .insert(syncRuns)
      .values({
        appId,
        status: "running",
        startedAt: new Date(),
      })
      .returning({ id: syncRuns.id });
    return rows[0].id;
  }

  async finish(
    id: number,
    r: {
      status: "success" | "error";
      pagesFetched: number;
      reviewsUpserted: number;
      error?: string;
    }
  ): Promise<void> {
    await this.db
      .update(syncRuns)
      .set({
        status: r.status,
        pagesFetched: r.pagesFetched,
        reviewsUpserted: r.reviewsUpserted,
        error: r.error ?? null,
        finishedAt: new Date(),
      })
      .where(eq(syncRuns.id, id));
  }
}
