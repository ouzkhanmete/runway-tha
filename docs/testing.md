# Testing

All tests use Bun's native test runner (`bun test`). **89 tests** across a three-level pyramid.

## Test layout

Unit and integration tests are **colocated** next to the code they test under `src/` (e.g. `apple-rss.mapper.test.ts` beside `apple-rss.mapper.ts`). Only **e2e** tests live under a `test/e2e/` directory. A root `tsconfig.build.json` excludes `*.test.ts` from build output.

## Test pyramid

### Unit tests — pure, no DB, no network

Colocated in `packages/core/src/**/*.test.ts`, `packages/shared/src/**/*.test.ts`, and `apps/worker/src/**/*.test.ts`.

| File | What is tested |
|---|---|
| `infrastructure/api-clients/apple-rss.mapper.test.ts` | `mapEntry` and `mapFeedPage`: metadata-entry filtering, field mapping, single-object edge case |
| `application/services/ingest-reviews.service.test.ts` | `IngestReviewsService`: port calls, success/error sync_run recording, rethrow on failure |
| `application/services/review-query.service.test.ts` | `ReviewQueryService`: `since` date computation, delegation to `findRecent`, injectable clock |
| `application/services/sync-scheduler.service.test.ts` | `SyncSchedulerService`: staleness + claim-TTL computation, per-app processing, lease release on success **and** failure, partial-failure isolation |
| `apps/worker/src/scheduler-loop.test.ts` | `startLoop`: no overlapping ticks even when a tick outlasts the interval; `stop()` halts further ticks |
| `packages/shared/src/dto/dto.test.ts` | All shared Zod schemas: valid parses, rejections, defaults, coercion |

Dependencies are replaced with inline fake objects (no mock library).

### Integration tests — real dockerized Postgres

Repository tests are colocated in `packages/core/src/infrastructure/repositories/*.test.ts`. The harness smoke test is in `packages/core/test/int/`. All require the test DB container.

| File | What is tested |
|---|---|
| `test/int/harness.smoke.test.ts` | Migrations apply and `truncateAll` works |
| `infrastructure/repositories/app.repository.test.ts` | `DrizzleAppRepository`: create (idempotent), findById, list, `claimDueForSync` (4 staleness cases + lease stamping, skip-already-claimed, reclaim-stuck-lease, **two concurrent claims never grab the same app**), `releaseClaim` |
| `infrastructure/repositories/review.repository.test.ts` | `DrizzleReviewRepository`: upsertMany (insert, idempotent upsert, content update, empty array), `findRecent` (filter by window, ordering, type coercions) |
| `infrastructure/api-clients/apple-rss.api-client.test.ts` | `AppleRssApiClient` with mocked `fetch`: URL construction, page aggregation, early-stop on empty page, retry on 429/403/5xx, throw after maxRetries |

`apple-rss.api-client.test.ts` uses only a mocked `fetch` — no real network. The test DB is not required for it.

### API e2e tests — real DB + Hono app via `app.request()`

Located in `apps/api/test/e2e/`. Also require the test DB container.

| File | What is tested |
|---|---|
| `apps.e2e.test.ts` | `POST /apps` (201, idempotent duplicate, 400 non-numeric, 400 bad JSON), `GET /apps` (empty, populated) |
| `reviews.e2e.test.ts` | `GET /apps/:appId/reviews` (200 with window filter + newest-first ordering + schema validation, 400 invalid window, 404 unknown app, 200 empty) |
| `full-flow.e2e.test.ts` | End-to-end flow: register app, confirm worker-style ingestion, query reviews |

### Client unit tests

Colocated in `apps/web/src/api/client.test.ts`.

| File | What is tested |
|---|---|
| `client.test.ts` | `createApiClient`: `getReviews`/`getApps`/`registerApp` — valid parse, malformed-payload throw, ApiError message extraction, generic error message |

## Running tests

### Prerequisites

Both the dev and test DB must be running for integration and e2e tests:

```sh
bun run db:test:up    # starts postgres on :5433 (test DB)
```

The test helpers auto-apply migrations via `ensureMigrated()` in `beforeAll`.

### Commands

```sh
# All tests (unit + integration + e2e)
bun test

# Specific package or file
bun test packages/core
bun test apps/api
```

`bun test` discovers all `*.test.ts` files across the workspace.

### Test DB details

Connection: `postgres://runway:runway@localhost:5433/runway_test`

Configured in `packages/core/test/helpers/test-db.ts`. Each test file calls `ensureMigrated()` once in `beforeAll` and `truncateAll()` in `beforeEach` to guarantee a clean slate between tests.

The test DB uses `tmpfs` storage — it is ephemeral and wiped on container restart. Run `bun run db:test:up` again after a restart.

See [`docs/infra.md`](infra.md) for the compose file details and [`docs/data-model.md`](data-model.md) for the schema the integration tests exercise.
