# Data Model

Three tables. All timestamps are `timestamptz`. Schema lives in `packages/core/src/infrastructure/db/schema.ts`; migrations in `packages/core/src/infrastructure/db/migrations/`.

## Tables

### `apps` — registry / control-plane

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | Numeric App Store ID (e.g. `595068606`) |
| `name` | `text` nullable | Not populated — name enrichment is deferred |
| `country` | `text` NOT NULL default `us` | Two-letter ISO country code |
| `created_at` | `timestamptz` NOT NULL default `now()` | Registration time |

Inserting a row here is the complete act of onboarding an app. The worker self-discovers it on the next tick via `findDueForSync`.

### `reviews` — review storage

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | Stable RSS review ID — the dedup key |
| `app_id` | `text` NOT NULL FK→apps | |
| `author` | `text` NOT NULL | Reviewer display name |
| `title` | `text` NOT NULL | Review title |
| `content` | `text` NOT NULL | Review body |
| `rating` | `integer` NOT NULL | 1–5 |
| `version` | `text` nullable | App version at review time |
| `submitted_at` | `timestamptz` NOT NULL | From RSS `updated` field (ISO+TZ) |
| `fetched_at` | `timestamptz` NOT NULL default `now()` | When the row was (last) upserted |

**Index:** `reviews_app_submitted_idx ON (app_id, submitted_at DESC)` — covers both the `WHERE app_id = ?` filter and the `ORDER BY submitted_at DESC` ordering used by `findRecent`.

### `sync_runs` — audit log and staleness signal

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` PK | Auto-increment |
| `app_id` | `text` NOT NULL FK→apps | |
| `started_at` | `timestamptz` NOT NULL default `now()` | When the run began |
| `finished_at` | `timestamptz` nullable | Set on completion (success or error) |
| `status` | `text` NOT NULL | `"success"` or `"error"` |
| `pages_fetched` | `integer` NOT NULL default `0` | |
| `reviews_upserted` | `integer` NOT NULL default `0` | |
| `error` | `text` nullable | Error message on failure |

`sync_runs` serves two roles simultaneously:

1. **Audit log** — every fetch attempt is recorded with timing and counts.
2. **Staleness signal** — `findDueForSync(staleBefore)` queries for apps that have _no_ successful run with `finished_at > staleBefore`. An error run does not satisfy this, so a previously-failed app remains eligible for retry on the next tick.

## Restart-safety and idempotency

`reviews` are upserted via Drizzle's `onConflictDoUpdate` on the PK (`id`). Apple's RSS feed uses a stable, numeric review ID that never changes for a given review. Consequently:

- Re-ingesting the same page after a crash produces exactly the same rows — no duplicates.
- No cursor, offset, or watermark is needed. The worker always fetches all pages and upserts everything.
- The only persistent state that changes across a re-run is `fetched_at` (refreshed to `now()` on re-upsert), which is not used for querying.

`apps` are inserted with `onConflictDoNothing`, making `POST /apps` also idempotent.

See [`docs/etl.md`](etl.md) for how `sync_runs` drives the worker scheduling loop.
