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
│  DrizzleSyncRunRepository, AppleRssApiClient            │
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

## Path-alias scheme

TypeScript paths are declared in `tsconfig.base.json`:

| Alias | Resolves to |
|---|---|
| `@packages/shared/*` | `packages/shared/src/*` |
| `@packages/core/*` | `packages/core/src/*` |
| `@apps/api/*` | `apps/api/src/*` |
| `@apps/worker/*` | `apps/worker/src/*` |
| `@apps/web/*` | `apps/web/src/*` |

Public package APIs are imported as `@packages/core/index` and `@packages/shared/index`. Deep imports use the full path, e.g. `@packages/core/domain/app`, `@packages/core/application/repositories/app.repository`.

## Package boundaries

### `packages/shared` — isomorphic

Used by all three apps and safe to import in the browser.

| Export | Purpose |
|---|---|
| `ReviewDtoSchema`, `ReviewDto` | Zod schema + inferred type for a review response |
| `AppDtoSchema`, `AppDto` | Schema + type for an app response |
| `RegisterAppRequestSchema` | POST /apps request validation |
| `makeReviewsQuerySchema`, `ReviewsQuerySchema` | Query-param validation (any int 1–8760, default 48) |
| `Country` | Full ISO 3166-1 alpha-2 enum (lowercase values) for storefront selection |
| `ApiErrorSchema`, `ApiError` | Error envelope schema |

### `packages/core` — server-only

Never imported by `apps/web`. Exports everything needed by `apps/api` and `apps/worker`.

| Sub-path | Contents |
|---|---|
| `src/domain/` | Plain TypeScript types; zero runtime dependencies |
| `src/application/repositories/` | Repository port interfaces (`AppRepository`, `ReviewRepository`, `SyncRunRepository`) |
| `src/application/api-clients/` | Feed client port interface (`ReviewFeedClient`) |
| `src/application/services/` | Use-case classes; depend only on port interfaces |
| `src/infrastructure/repositories/` | Drizzle repo implementations + `createRepositories(db)` factory |
| `src/infrastructure/api-clients/` | `AppleRssApiClient` (implements `ReviewFeedClient`), mapper, types |
| `src/infrastructure/db/` | DB client, schema, migrations |
| `src/config/env.ts` | `loadEnv()` — Zod-validated environment config with defaults |

## Composition roots

Each runnable app builds its own object graph in a `composition-root.ts`, then exports a factory used by `main.ts`. No service locator, no DI container.

### `apps/api` composition root

```
createDb(url)
  → createRepositories(db)  ← { reviews, apps, syncRuns }
  → ReviewQueryService({ reviews })
  → AppRegistryService({ apps })
  → makeReviewsQuerySchema(defaultHours)
  → createApp({ reviewQuery, registry, reviewsQuerySchema })  ← Hono app
```

### `apps/worker` composition root

```
createDb(url)
  → createRepositories(db)  ← { reviews, apps, syncRuns }
  → AppleRssApiClient({ fetch, baseUrl, maxPages, maxRetries })
  → IngestReviewsService({ feed, reviews, syncRuns })
  → SyncSchedulerService({ apps, ingest, stalenessMs, concurrency })
```

The worker has no startup seeding. Apps are registered via `POST /apps` or the web UI; the worker discovers them on the next tick.

## Key invariants

- **Reviews are upserted** (not inserted) using the stable RSS review `id` as the PK → ingestion is idempotent → safe to stop and restart at any time without losing or duplicating data.
- **The worker is the sole writer of `reviews`**. The API only reads reviews and writes the `apps` row on registration.
- **Table-driven scheduling**: on each tick the scheduler reads `apps ⋈ sync_runs` to find apps with no successful run inside the staleness window. Onboarding a new app is a single row insert via `POST /apps`.

See [`docs/data-model.md`](data-model.md) for the schema, [`docs/etl.md`](etl.md) for the worker loop, [`docs/api.md`](api.md) for routes.
