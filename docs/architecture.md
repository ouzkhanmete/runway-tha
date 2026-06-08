# Architecture

## Overview

The system follows **clean architecture**: dependencies point inward. Outer layers depend on port interfaces; concrete adapters are wired at each app's composition root via plain constructor injection (no DI library).

```
┌─────────────────────────────────────────────────────────┐
│  Presentation                                           │
│  apps/api (Hono routes)  apps/worker (scheduler loop)  │
│  apps/web (React UI)                                    │
└──────────────────────┬──────────────────────────────────┘
                       │ uses
┌──────────────────────▼──────────────────────────────────┐
│  Application  (packages/core/src/application/)          │
│  Services: AppRegistryService, ReviewQueryService,      │
│            IngestReviewsService, SyncSchedulerService   │
│  Ports (interfaces): AppRepository, ReviewRepository,   │
│            SyncRunRepository, ReviewFeedClient          │
└──────────────────────┬──────────────────────────────────┘
                       │ implements
┌──────────────────────▼──────────────────────────────────┐
│  Infrastructure  (packages/core/src/infrastructure/)    │
│  DrizzleAppRepository, DrizzleReviewRepository,         │
│  DrizzleSyncRunRepository, AppStoreFeedClient           │
│  DB: drizzle-orm/bun-sql (Bun-native SQL driver)        │
└──────────────────────┬──────────────────────────────────┘
                       │ operates on
┌──────────────────────▼──────────────────────────────────┐
│  Domain  (packages/core/src/domain/)                    │
│  Types: App, Review, SyncRun, Rating                    │
│  Errors: NotFoundError                                  │
└─────────────────────────────────────────────────────────┘
```

**Dependency rule:** domain has no external deps; application depends only on domain types and port interfaces; infrastructure implements those interfaces; presentation calls application services.

## Package boundaries

### `packages/shared` — isomorphic

Used by all three apps and safe to import in the browser.

| Export | Purpose |
|---|---|
| `ReviewDtoSchema`, `ReviewDto` | Zod schema + inferred type for a review response |
| `AppDtoSchema`, `AppDto` | Schema + type for an app response |
| `RegisterAppRequestSchema` | POST /apps request validation |
| `ReviewsQuerySchema`, `ALLOWED_WINDOW_HOURS` | Query-param validation and allowed windows |
| `ApiErrorSchema`, `ApiError` | Error envelope schema |

### `packages/core` — server-only

Never imported by `apps/web`. Exports everything needed by `apps/api` and `apps/worker`.

| Sub-path | Contents |
|---|---|
| `src/domain/` | Plain TypeScript types; zero runtime dependencies |
| `src/application/ports/` | TypeScript interfaces (ports) |
| `src/application/services/` | Use-case classes; depend only on port interfaces |
| `src/infrastructure/` | Concrete adapters (Drizzle repos, feed client, DB client, config) |
| `src/config/env.ts` | `loadEnv()` — Zod-validated environment config with defaults |

## Composition roots

Each runnable app builds its own object graph in a `composition-root.ts`, then exports a factory used by `main.ts`. No service locator, no DI container.

### `apps/api` composition root

```
createDb(url)
  → DrizzleAppRepository
  → DrizzleReviewRepository
  → ReviewQueryService({ reviews })
  → AppRegistryService({ apps })
  → createApp({ reviewQuery, registry })  ← Hono app
```

### `apps/worker` composition root

```
createDb(url)
  → DrizzleAppRepository
  → DrizzleReviewRepository
  → DrizzleSyncRunRepository
  → AppStoreFeedClient({ fetch, baseUrl, maxPages, maxRetries })
  → IngestReviewsService({ feed, reviews, syncRuns })
  → SyncSchedulerService({ apps, ingest, stalenessMin, concurrency })
  → AppRegistryService({ apps })  ← used only for seed-on-startup
```

## Key invariants

- **Reviews are upserted** (not inserted) using the stable RSS review `id` as the PK → ingestion is idempotent → safe to stop and restart at any time without losing or duplicating data.
- **The worker is the sole writer of `reviews`**. The API only reads reviews and writes the `apps` row on registration.
- **Table-driven scheduling**: on each tick the scheduler reads `apps ⋈ sync_runs` to find apps with no successful run inside the staleness window. Onboarding a new app is a single row insert via `POST /apps`.

See [`docs/data-model.md`](data-model.md) for the schema, [`docs/etl.md`](etl.md) for the worker loop, [`docs/api.md`](api.md) for routes.
