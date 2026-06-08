import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { App } from "@packages/core/domain/app";
import { SyncStatus } from "@packages/core/domain/sync-status";
import { Country } from "@packages/shared/index";
import { and, eq, gt, notExists } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";

const { apps, syncRuns } = schema;

export class DrizzleAppRepository implements AppRepository {
  constructor(private db: Db) {}

  async list(): Promise<App[]> {
    const rows = await this.db.select().from(apps);
    return rows.map(toApp);
  }

  async findById(id: string): Promise<App | null> {
    const rows = await this.db.select().from(apps).where(eq(apps.id, id));
    return rows[0] ? toApp(rows[0]) : null;
  }

  async create(input: { id: string; name?: string | null; country?: Country }): Promise<App> {
    await this.db
      .insert(apps)
      .values({
        id: input.id,
        name: input.name ?? null,
        country: input.country ?? Country.US,
      })
      .onConflictDoNothing();

    const rows = await this.db.select().from(apps).where(eq(apps.id, input.id));
    return toApp(rows[0]);
  }

  async findDueForSync(staleBefore: Date): Promise<App[]> {
    const rows = await this.db
      .select()
      .from(apps)
      .where(
        notExists(
          this.db
            .select()
            .from(syncRuns)
            .where(
              and(
                eq(syncRuns.appId, apps.id),
                eq(syncRuns.status, SyncStatus.Success),
                gt(syncRuns.finishedAt, staleBefore),
              ),
            ),
        ),
      );
    return rows.map(toApp);
  }
}

function toApp(row: typeof apps.$inferSelect): App {
  return {
    id: row.id,
    name: row.name,
    country: row.country as Country,
    createdAt: row.createdAt,
  };
}
