import { migrate } from "drizzle-orm/bun-sql/migrator";
import { createDb } from "./client";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");
const db = createDb(url);
await migrate(db, { migrationsFolder: `${import.meta.dir}/migrations` });
console.log("migrations applied");
