# Recent iOS App Store Reviews Viewer

A small full-stack system that ingests iOS **App Store reviews** from Apple's customer-reviews RSS feed, stores them durably in Postgres, and displays the **most recent reviews (last 48 hours by default)** newest-first in a React UI.

Built as a take-home assessment, with [Claude Code](https://docs.claude.com/en/docs/claude-code) — see [`INTERACTION.md`](./INTERACTION.md) for the full prompt-by-prompt build log.

## What it does

- A **worker** polls the App Store RSS feed on a schedule and upserts reviews into Postgres (idempotent by stable review id → safe to stop/restart without losing or duplicating data).
- An **API** serves the stored reviews (newest-first, configurable time window) and lets you register new apps to track.
- A **web** app displays the reviews: pick an app, pick a window (48h / 7d / 30d), read the reviews.
- **Multi-app by design:** onboarding an app is a single `POST /apps`; the worker self-discovers and backfills it on the next tick.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime / tooling | Bun (workspaces + native test runner) |
| Backend | TypeScript + Hono |
| Database | PostgreSQL 18 + Drizzle ORM |
| Validation | Zod (shared DTOs) |
| Frontend | React + Vite + TanStack Query |
| Infra | Docker Compose (local · test · full) |

## Architecture (at a glance)

Clean-architecture layering with a composition root + native constructor dependency injection:

```
apps/api      Hono REST API (reads reviews, registers apps)
apps/worker   Table-driven ETL poller (sole writer of reviews)
apps/web      React + Vite frontend
packages/shared   Isomorphic domain types + Zod DTO schemas (api · worker · web)
packages/core     Server-only domain · use-cases · ports · Drizzle repos · feed client
```

See [`CLAUDE.md`](./CLAUDE.md) for the documentation map, and [`docs/`](./docs) for subsystem write-ups.

## Status

🚧 Scaffolding in progress — see [`INTERACTION.md`](./INTERACTION.md). Run instructions land with the implementation.
