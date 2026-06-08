import { eq, and, gt, notExists } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import type { AppRepository } from "../../application/ports/app-repository";
import type { App } from "../../domain/app";

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

  async create(input: {
    id: string;
    name?: string | null;
    country?: string;
  }): Promise<App> {
    await this.db
      .insert(apps)
      .values({
        id: input.id,
        name: input.name ?? null,
        country: input.country ?? "us",
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
                eq(syncRuns.status, "success"),
                gt(syncRuns.finishedAt, staleBefore)
              )
            )
        )
      );
    return rows.map(toApp);
  }
}

function toApp(row: typeof apps.$inferSelect): App {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    createdAt: row.createdAt,
  };
}
