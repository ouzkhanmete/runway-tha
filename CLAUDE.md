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

## Documentation map

Read the doc before working on the matching area. `✅` exists · `⏳` planned (added as its subsystem lands).

| Doc | Read it when… | Status |
|---|---|---|
| `docs/architecture.md` | changing layering, DI/composition roots, package boundaries | ⏳ |
| `docs/data-model.md` | touching the schema, migrations, or restart-safety/idempotency | ⏳ |
| `docs/etl.md` | working on the worker, RSS parsing, pagination, rate limits, staleness | ⏳ |
| `docs/api.md` | adding/altering API routes, DTOs, error handling | ⏳ |
| `docs/frontend.md` | working on the web app, data fetching, components | ⏳ |
| `docs/infra.md` | docker-compose, migrations, running things locally | ⏳ |
| `docs/testing.md` | writing/running tests, understanding the test pyramid | ⏳ |
| `docs/decisions.md` | questioning a tech choice or a 3rd-party dependency | ⏳ |

The full design spec lives at `docs/superpowers/specs/2026-06-08-app-store-reviews-viewer-design.md` (git-ignored working artifact).

## Conventions

- **Commits:** Conventional Commits, **no scope** — `feat: …`, `fix: …`, `chore: …`, `docs: …`, `test: …`, `refactor: …`. Commit straight to `main`.
- **Per turn:** append an entry to `INTERACTION.md` (the prompt + a summary of changes) and make one commit.
- **Tests:** Bun's native test runner. Repositories are always tested against a **real dockerized Postgres** (test compose, separate port).
- **Validation:** Zod DTOs at the API boundary; schemas live in `packages/shared` and are reused by the FE.
- **Don't commit** `docs/superpowers/` (git-ignored) or `.env`.

## Commands

_Populated as the tooling lands (Bun scripts for dev/test/migrate/compose)._
