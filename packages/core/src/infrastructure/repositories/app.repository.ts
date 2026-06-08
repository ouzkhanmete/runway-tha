import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { App } from "@packages/core/domain/app";
import { SyncStatus } from "@packages/core/domain/sync-status";
import { Country } from "@packages/shared/index";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";

const { apps } = schema;

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

  async claimDueForSync(opts: {
    staleBefore: Date;
    claimExpiredBefore: Date;
    claimedAt: Date;
  }): Promise<App[]> {
    const { staleBefore, claimExpiredBefore, claimedAt } = opts;
    // Single atomic statement: the inner SELECT picks due, unclaimed (or stuck-claimed)
    // apps and locks those rows with FOR UPDATE SKIP LOCKED so a concurrent worker's
    // identical claim skips them; the outer UPDATE stamps claimed_at and RETURNs the
    // rows this worker won. Two workers can therefore never claim the same app.
    const rows = await this.db.execute(sql`
      UPDATE ${apps}
      SET claimed_at = ${claimedAt}
      FROM (
        SELECT a.id
        FROM ${apps} a
        WHERE NOT EXISTS (
          SELECT 1 FROM sync_runs s
          WHERE s.app_id = a.id
            AND s.status = ${SyncStatus.Success}
            AND s.finished_at > ${staleBefore}
        )
          AND (a.claimed_at IS NULL OR a.claimed_at < ${claimExpiredBefore})
        FOR UPDATE SKIP LOCKED
      ) AS due
      WHERE ${apps}.id = due.id
      RETURNING
        ${apps}.id AS "id",
        ${apps}.name AS "name",
        ${apps}.country AS "country",
        ${apps}.created_at AS "createdAt",
        ${apps}.claimed_at AS "claimedAt"
    `);
    return [...rows].map((row) => toApp(row as AppRow));
  }

  async releaseClaim(appId: string): Promise<void> {
    await this.db.update(apps).set({ claimedAt: null }).where(eq(apps.id, appId));
  }

  async updateName(appId: string, name: string): Promise<void> {
    await this.db.update(apps).set({ name }).where(eq(apps.id, appId));
  }
}

interface AppRow {
  id: string;
  name: string | null;
  country: string;
  createdAt: Date;
  claimedAt: Date | null;
}

function toApp(row: AppRow): App {
  return {
    id: row.id,
    name: row.name,
    country: row.country as Country,
    createdAt: row.createdAt,
    claimedAt: row.claimedAt ?? null,
  };
}
