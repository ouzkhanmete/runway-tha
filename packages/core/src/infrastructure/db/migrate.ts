import { migrate } from "drizzle-orm/bun-sql/migrator";
import { loadEnv } from "../../config/env";
import { createDb } from "./client";

// Use the same env loader as the apps so DATABASE_URL defaults to the local dev
// URL when unset (matching `drizzle.config.ts`) and respects an explicit value.
const { DATABASE_URL } = loadEnv();
const db = createDb(DATABASE_URL);
await migrate(db, { migrationsFolder: `${import.meta.dir}/migrations` });
console.log(`migrations applied to ${DATABASE_URL}`);
