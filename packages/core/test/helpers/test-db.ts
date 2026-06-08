import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { createDb } from "../../src/infrastructure/db/client";

const url = process.env.DATABASE_URL_TEST ?? "postgres://runway:runway@localhost:5433/runway_test";
let migrated = false;

export function getTestDb() {
  return createDb(url);
}

export async function ensureMigrated() {
  if (migrated) return;
  await migrate(getTestDb(), {
    migrationsFolder: `${import.meta.dir}/../../src/infrastructure/db/migrations`,
  });
  migrated = true;
}

export async function truncateAll(db = getTestDb()) {
  await db.execute(sql`TRUNCATE reviews, sync_runs, apps RESTART IDENTITY CASCADE`);
}
