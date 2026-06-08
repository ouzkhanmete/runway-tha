import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
export const apps = pgTable("apps", {
  id: text("id").primaryKey(),
  name: text("name"),
  country: text("country").notNull().default("us"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Worker claim lease: NULL = not claimed. A worker stamps this when it claims the
  // app for a sync; it is cleared on finish. A claim older than WORKER_CLAIM_TTL_MS is
  // treated as stuck (crashed worker) and may be reclaimed. See claimDueForSync.
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
});
export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    author: text("author").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    rating: integer("rating").notNull(),
    version: text("version"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_app_submitted_idx").on(t.appId, t.submittedAt.desc())],
);
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    reviewsUpserted: integer("reviews_upserted").notNull().default(0),
    error: text("error"),
  },
  // Serves the worker's "due for sync" query: per app, the latest successful run
  // (WHERE app_id = ? AND status = 'success' AND finished_at > ?).
  (t) => [index("sync_runs_app_status_finished_idx").on(t.appId, t.status, t.finishedAt)],
);
