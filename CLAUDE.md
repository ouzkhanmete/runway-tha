# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## Project

**Recent iOS App Store Reviews Viewer** — a Bun monorepo that ingests App Store reviews from Apple's customer-reviews RSS feed into Postgres and serves the most-recent reviews (default last 48h, newest-first) to a React UI. Local demo only; no deployment/CI.

## Monorepo layout

```
apps/api      Hono REST API — reads reviews, registers apps (composition root)
apps/worker   Table-driven ETL poller — sole writer of reviews (composition root)
apps/web      React + Vite frontend
packages/shared   Isomorphic: domain types, enums, Zod DTO schemas (api · worker · web)
packages/core     Server-only: domain · application (use-cases + ports) · infrastructure (Drizzle repos, feed client, db, config)
docker/       docker-compose (local · test · full) + Dockerfiles
docs/         subsystem documentation (see map below)
```

## Architecture

Clean-architecture layering; dependencies point inward. Outer layers depend on **ports (interfaces)**; concrete adapters are constructed and injected in each app's **composition root** via plain constructors (no DI library).
`domain → application (use-cases + ports) → infrastructure (adapters)`, with presentation (api routes / worker scheduler / web) on the outside.

**Key invariants**
- Reviews are **upserted by stable RSS review `id`** → ingestion is idempotent → safe stop/restart (no cursor needed for correctness).
- The **worker is the only writer of `reviews`**; the API only reads reviews and writes the `apps` row on registration.
- The worker is **table-driven**: each tick it reads `apps ⨝ sync_runs` and processes apps with no successful run inside the staleness window. Onboarding an app = one insert.
- The worker is **safe to run as multiple instances**: each tick **atomically claims** its apps via `UPDATE … FOR UPDATE SKIP LOCKED` (stamping `apps.claimed_at`), so two workers never process the same app. The lease is released on finish and reclaimable after `WORKER_CLAIM_TTL_MS` if a worker crashes. The scheduler loop is a self-rescheduling `setTimeout`, so ticks never overlap.

## Documentation map

Read the doc before working on the matching area. `✅` exists · `⏳` planned (added as its subsystem lands).

| Doc | Read it when… | Status |
|---|---|---|
| `docs/architecture.md` | changing layering, DI/composition roots, package boundaries | ✅ |
| `docs/data-model.md` | touching the schema, migrations, or restart-safety/idempotency | ✅ |
| `docs/etl.md` | working on the worker, RSS parsing, pagination, rate limits, staleness | ✅ |
| `docs/api.md` | adding/altering API routes, DTOs, error handling | ✅ |
| `docs/frontend.md` | working on the web app, data fetching, components | ✅ |
| `docs/infra.md` | docker-compose, migrations, running things locally | ✅ |
| `docs/testing.md` | writing/running tests, understanding the test pyramid | ✅ |
| `docs/decisions.md` | questioning a tech choice or a 3rd-party dependency | ✅ |

The full design spec lives at `docs/superpowers/specs/2026-06-08-app-store-reviews-viewer-design.md` (git-ignored working artifact).

## Conventions

- **Commits:** Conventional Commits, **no scope** — `feat: …`, `fix: …`, `chore: …`, `docs: …`, `test: …`, `refactor: …`. Commit straight to `main`.
- **Per turn:** append an entry to `INTERACTION.md` (the prompt + a summary of changes) and make one commit.
- **Tests:** Bun's native test runner. Unit and integration tests are **colocated** with the code they test under `src/` (e.g. `foo.service.test.ts` beside `foo.service.ts`). Only e2e tests live under `test/e2e/`. Repositories are always tested against a **real dockerized Postgres** (test compose, separate port).
- **Validation:** Zod DTOs at the API boundary; schemas live in `packages/shared` and are reused by the FE.
- **Don't commit** `docs/superpowers/` (git-ignored) or `.env`.

## Commands

### Database

```sh
bun run db:up          # Start local Postgres on :5432 (dev)
bun run db:down        # Stop local Postgres
bun run db:test:up     # Start test Postgres on :5433 (required before running tests)
bun run db:test:down   # Stop test Postgres
```

### Migrations

```sh
bun run migrate        # Apply migrations to DATABASE_URL (default: local dev DB)
bun run generate       # Regenerate migration files after schema changes
```

### Development (run each in a separate terminal)

```sh
bun run dev:worker     # Start the ETL worker (watches for changes)
bun run dev:api        # Start the Hono API on :3000 (watches for changes)
bun run dev:web        # Start the Vite dev server on :5173
```

There is no seed step — register an app via the web UI (http://localhost:5173) or `POST /apps` (e.g. App Store ID `595068606`), then the worker picks it up on its next tick. The Vite dev server proxies `/api` to `localhost:3000`.

### Tests

```sh
bun run db:test:up     # Start test DB first (only needed once per session)
bun test               # Run all 89 tests (unit + integration + e2e)
```

### Formatting

```sh
bun run format         # Biome: format + organise imports (write mode)
bun run format:check   # Biome: check only (CI-safe)
```

### Full stack (Docker only — no local tooling required)

```sh
docker compose -f docker/docker-compose.full.yml up --build
```

Web UI at http://localhost:5173 · API at http://localhost:3001
