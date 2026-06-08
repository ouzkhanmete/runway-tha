import type { SyncRunRepository } from "@packages/core/application/repositories/sync-run.repository";
import { SyncStatus } from "@packages/core/domain/sync-status";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";

const { syncRuns } = schema;

export class DrizzleSyncRunRepository implements SyncRunRepository {
  constructor(private db: Db) {}

  async start(appId: string): Promise<number> {
    const rows = await this.db
      .insert(syncRuns)
      .values({
        appId,
        status: SyncStatus.Running,
        startedAt: new Date(),
      })
      .returning({ id: syncRuns.id });
    return rows[0].id;
  }

  async finish(
    id: number,
    r: {
      status: SyncStatus;
      pagesFetched: number;
      reviewsUpserted: number;
      error?: string;
    },
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
