import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./src/infrastructure/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://runway:runway@localhost:5432/runway" },
});
