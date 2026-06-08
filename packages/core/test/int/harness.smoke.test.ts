import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { ensureMigrated, getTestDb, truncateAll } from "../helpers/test-db";

beforeAll(async () => {
  await ensureMigrated();
});

test("test db migrates and truncates", async () => {
  await truncateAll();
  const db = getTestDb();
  const rows = await db.execute(sql`SELECT count(*)::int AS n FROM apps`);
  expect(rows).toBeDefined();
});
