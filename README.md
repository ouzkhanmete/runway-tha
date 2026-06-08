# Recent iOS App Store Reviews Viewer

A small full-stack system that ingests iOS **App Store reviews** from Apple's customer-reviews RSS feed, stores them durably in Postgres, and serves the **most recent reviews** (last 48 hours by default, newest-first) to a React UI.

Built as a take-home assessment with [Claude Code](https://docs.claude.com/en/docs/claude-code) — see [`INTERACTION.md`](./INTERACTION.md) for the full, prompt-by-prompt build log.

## What it does

- A **worker** polls the App Store RSS feed on a schedule and upserts reviews into Postgres. Ingestion is **idempotent** (keyed on the stable review id), so the worker is safe to stop, restart, or crash mid-run without losing or duplicating data.
- An **API** serves the stored reviews (newest-first, configurable window, cursor-paginated) and lets you register apps to track.
- A **web** app ties it together: pick an app, pick a window (48h … 1y), and scroll an infinite list of reviews. The selected app lives in the URL (`?appId=`) so it survives a refresh and is shareable.
- **Multi-app and multi-worker by design.** Onboarding an app is a single `POST /apps`; the worker self-discovers it on the next tick. Workers claim apps atomically, so you can run several of them without double-processing, and the scheduler never overlaps its own ticks.

## Architecture

### Runtime data flow

```
   Apple App Store  ·  customer-reviews RSS feed
   │
   │   worker fetches ≤10 pages (~500 newest reviews) per app, per sync
   ▼
   [ WORKER ]  apps/worker  —  the ONLY writer of `reviews`
   │     • ~10s tick, self-scheduling setTimeout → runs never overlap
   │     • claims due apps atomically:  UPDATE … FOR UPDATE SKIP LOCKED
   │     • upserts by stable review id → idempotent, restart-safe
   │     • records a sync_run (success | error) every tick
   ▼  writes
   [ POSTGRES 18 ]   apps  ·  reviews  ·  sync_runs
   │     • reviews PK = RSS review id;  index (app_id, submitted_at↓, id↓)
   │     • apps carries a claim lease (claimed_at) for multi-worker safety
   │     • sync_runs = per-tick audit log + the "is this app due?" signal
   ▼  reads reviews / writes the apps row only
   [ API ]  apps/api · Hono   (never writes reviews)
   │     • GET /apps      ·  POST /apps   (idempotent register)
   │     • GET /apps/:id/reviews?windowHours&limit&cursor
   │           → { items: ReviewDto[], nextCursor }   (keyset pages of 5)
   ▼  JSON · Zod-validated DTOs · Vite dev server proxies /api → :3000
   [ WEB ]  apps/web · React + TanStack Query
   │     • app selector (kept in the URL as ?appId=) · window picker 48h…1y
   │     • infinite-scroll review list (keyset cursor pagination)
   ▼
   Browser
```

The two halves are intentionally decoupled: the **worker writes**, the **API reads**, and Postgres is the contract between them. There is no in-process coupling, no shared queue, and no cursor/watermark to keep in sync — the database is the single source of truth for both "which apps to poll" and "what reviews exist".

### Clean-architecture layering

Each app is a thin **composition root** that wires concrete adapters into interfaces using plain constructors (no DI framework). Dependencies point inward; the domain imports nothing.

```
   dependencies point inward — the domain depends on nothing

   presentation     api routes · worker scheduler · web UI
        │   composition root injects concrete adapters into ports
   infrastructure   Drizzle repositories · Apple RSS client · Postgres
        │   implements the ports (interfaces) declared one layer down
   application      use-cases (services)  +  ports (interfaces)
        │   pure orchestration; depends only on the domain
   domain           entities · enums · invariants    (no dependencies)
```

### Monorepo layout

```
apps/api          Hono REST API — reads reviews, registers apps (composition root)
apps/worker       Table-driven ETL poller — sole writer of reviews (composition root)
apps/web          React + Vite frontend
packages/shared   Isomorphic: domain types, enums, Zod DTO schemas (used by api · worker · web)
packages/core     Server-only: domain · application (use-cases + ports) · infrastructure
                  (Drizzle repos, Apple RSS client, db, config)
docker/           docker-compose (local · test · full) + Dockerfiles
docs/             subsystem deep-dives (see the documentation map below)
```

## How the key pieces work

A guided tour of the decisions a reviewer is most likely to care about. Each links to the doc with the full rationale.

- **Idempotent ingestion + durable storage = survives a restart.** Two halves: (1) reviews are upserted with `ON CONFLICT (id) DO UPDATE` on Apple's stable review id, so re-fetching produces the same rows — no duplicates, no cursor to persist — and a crashed or restarted worker just re-runs and converges; (2) Postgres is **bind-mounted to a gitignored `./.data/` directory in the repo**, so the data files live on disk and persist across `restart`, `down`+`up`, and even `down -v`. (Verified: ingest 500 reviews → `down -v` → `up` → still 500.) ([`docs/data-model.md`](docs/data-model.md) · [`docs/infra.md`](docs/infra.md#data-persistence))
- **The worker is the only writer of `reviews`; the API only reads.** Onboarding is one `INSERT` into `apps`. Each tick the worker reads `apps ⨝ sync_runs` to find apps with no successful run inside the staleness window (default 15 min) and processes them — table-driven, so adding an app needs no config reload or restart. ([`docs/etl.md`](docs/etl.md))
- **Multi-worker safety via an atomic claim lease.** Before processing, a worker claims its apps in a single statement — `UPDATE apps SET claimed_at = now() … FOR UPDATE SKIP LOCKED RETURNING …` — so two workers can never grab the same app. `SKIP LOCKED` handles the simultaneous race; the `claimed_at` timestamp handles the after-commit window and doubles as crash recovery (a lease older than `WORKER_CLAIM_TTL_MS` is reclaimable). The scheduler loop is a self-rescheduling `setTimeout`, so a slow tick delays the next one instead of overlapping it. ([`docs/etl.md`](docs/etl.md#multi-worker-safety-the-claim-lease))
- **Keyset (cursor) pagination, not OFFSET.** Reviews page 5-at-a-time with an opaque cursor: `WHERE (submitted_at, id) < (?, ?) ORDER BY submitted_at DESC, id DESC LIMIT n`. Each page is a bounded index range-scan that stays stable as new reviews arrive (OFFSET would skip or repeat rows). The trailing `id` makes the sort total so the cursor is unambiguous when timestamps tie; the index `(app_id, submitted_at DESC, id DESC)` serves the filter, ordering, and cursor as one scan. ([`docs/decisions.md`](docs/decisions.md))
- **One validation contract, shared by both sides.** Zod DTO schemas live in `packages/shared` and are imported by the API (request/response validation) *and* the web client (response parsing) — the wire format can't drift between front and back end. ([`docs/api.md`](docs/api.md))
- **Tested as a pyramid against real infrastructure.** Pure units (mapper, services, schemas) use inline fakes; repositories and the API contract are integration/e2e tested against a **real dockerized Postgres** (separate port), because that's where idempotency, the keyset cursor, and the atomic claim actually have to hold. ([`docs/testing.md`](docs/testing.md))

### Data model

Three tables, all timestamps `timestamptz` ([`docs/data-model.md`](docs/data-model.md)):

| Table | Role |
|---|---|
| `apps` | Registry / control-plane. One row per tracked app + a `claimed_at` worker lease. |
| `reviews` | Review store. PK = stable RSS id (the idempotency key); indexed `(app_id, submitted_at↓, id↓)`. |
| `sync_runs` | Per-tick audit log **and** the staleness signal that drives "which apps are due". |

Schema changes are additive, idempotent SQL migrations (`0000` init, `0001` claim lease, `0002` keyset index) — each uses `IF [NOT] EXISTS` so it is safe to re-apply.

## API

No auth. Base URL `:3000` (local) / `:3001` (Docker). DTOs are defined in `packages/shared` ([`docs/api.md`](docs/api.md)).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/apps` | List registered apps (`AppDto[]`) |
| `POST` | `/apps` | Register an app — idempotent (`{ appId, country? }`) |
| `GET` | `/apps/:appId/reviews` | Recent reviews, cursor-paginated |

`GET …/reviews` query params: `windowHours` (1–8760, default 48), `limit` (1–50, default 5), `cursor` (opaque token from a previous page's `nextCursor`). Returns `{ items: ReviewDto[], nextCursor: string | null }`. Errors use a consistent envelope (`VALIDATION` 400 · `NOT_FOUND` 404 · `INTERNAL` 500).

## Tech stack

| Layer | Choice |
|---|---|
| Runtime / tooling | Bun (workspaces + native test runner) · Biome (format) |
| Backend | TypeScript + Hono |
| Database | PostgreSQL 18 + Drizzle ORM (Bun-native SQL driver, no `pg`) |
| Validation | Zod (shared DTOs) |
| Frontend | React + Vite + TanStack Query |
| Infra | Docker Compose (local · test · full) |

## Quick start

### Option A — local dev (requires Bun and Docker)

```sh
bun install            # 1. install dependencies
bun run db:up          # 2. start Postgres (:5432)
bun run migrate        # 3. apply migrations

# 4. start each in its own terminal
bun run dev:worker     # ETL poller — claims & ingests due apps each tick
bun run dev:api        # Hono API on :3000
bun run dev:web        # React UI on :5173 (proxies /api → :3000)
```

Open **http://localhost:5173**, then **add an app** (the "Add app" form or `POST /apps`) — e.g. App Store ID `595068606`. The worker ingests it within ~10 s and the UI shows a loader until the first reviews land. If the default 48h window is empty, widen it (**7d** … **1y**) — many apps' newest review is several days old.

### Option B — one-command full stack (Docker only)

```sh
docker compose -f docker/docker-compose.full.yml up --build
```

- Web UI: **http://localhost:5173** · API: **http://localhost:3001**
- The `migrate` service runs (and applies all migrations) before the worker and API start.
- The worker polls immediately — add an App Store ID via the form or `POST /apps` and it ingests within one tick.
- **Data persists** in `./.data/postgres-full` (gitignored, bind-mounted) — stop and restart the stack (even `docker compose … down -v`) and your reviews are still there.

### Finding App Store IDs to test with

Apple exposes two handy lookups:

```sh
# Search by name → each result's trackId is the App Store ID
curl "https://itunes.apple.com/search?term=spotify&country=us&entity=software&limit=5"

# Current top free apps → entry[].id.attributes.im:id
curl "https://itunes.apple.com/us/rss/topfreeapplications/limit=10/json"
```

e.g. Spotify `324684580`, Apple Music `1108187390`, ChatGPT `6448311069`.

## Running the tests

```sh
bun run db:test:up     # start the test Postgres on :5433 (once per session)
bun test               # 102 tests: unit + integration (real PG) + e2e
```

Repositories and the API contract run against a real dockerized Postgres on a separate port from dev. See [`docs/testing.md`](docs/testing.md).

## Documentation map

Deep-dives live in [`docs/`](./docs); read the one matching the area you're touching.

| Doc | Covers |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Layering, composition roots, package boundaries |
| [`docs/data-model.md`](docs/data-model.md) | Schema, migrations, restart-safety / idempotency |
| [`docs/etl.md`](docs/etl.md) | Worker loop, RSS parsing, claim lease, rate limits, staleness |
| [`docs/api.md`](docs/api.md) | Routes, DTOs, pagination, error handling |
| [`docs/frontend.md`](docs/frontend.md) | Web app, data fetching, components, URL state |
| [`docs/infra.md`](docs/infra.md) | docker-compose, migrations, running things locally |
| [`docs/testing.md`](docs/testing.md) | Test pyramid and how to run it |
| [`docs/decisions.md`](docs/decisions.md) | Why each notable tech / design choice was made |

`CLAUDE.md` is the contributor-facing brief (conventions + the same doc map). The full build log is in [`INTERACTION.md`](./INTERACTION.md).
