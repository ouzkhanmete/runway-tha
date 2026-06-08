# API

Hono REST API (`apps/api`). Listens on `APP_PORT` (default `3000`). No authentication. Routes are organised into controller classes (`HealthController`, `AppsController`, `ReviewsController` in `apps/api/src/controllers/`), each exposing a `routes(app)` method registered by the Hono app.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/apps` | List all registered apps |
| `POST` | `/apps` | Register an app (idempotent) |
| `GET` | `/apps/:appId/reviews` | Recent reviews for an app |

### `GET /health`

```json
{ "status": "ok" }
```

Always `200`. No DB dependency.

### `GET /apps`

Returns `AppDto[]`. Empty array if no apps are registered.

### `POST /apps`

Register an app to track. Create-only — calling it again with the same `appId` returns the existing record without error.

**Request body** (`RegisterAppRequest`):

| Field | Type | Required | Validation |
|---|---|---|---|
| `appId` | `string` | Yes | Must match `/^\d+$/` (numeric) |
| `country` | `string` | No | Two-character ISO code; defaults to `"us"` |

**Response:** `AppDto` with HTTP `201`.

**Errors:** `400 VALIDATION` if `appId` is non-numeric or body is unparseable JSON.

After registration the worker picks the new app up on its next tick — no manual trigger needed.

### `GET /apps/:appId/reviews?windowHours=48&limit=5&cursor=…`

Cursor-paginated, newest-first (`submittedAt DESC, id DESC`).

**Query parameters:**

| Param | Default | Allowed values | Notes |
|---|---|---|---|
| `windowHours` | `48` (env `REVIEW_WINDOW_HOURS_DEFAULT`) | Any integer 1–8760 (up to 1 year) | Out-of-range or non-integer → 400 |
| `limit` | `5` | Integer 1–50 | Page size |
| `cursor` | — | Opaque token | The `nextCursor` from a previous page; malformed → 400 |

Returns a `ReviewsPageDto`: `{ items: ReviewDto[]; nextCursor: string | null }`. `nextCursor` is an opaque keyset token to fetch the next page; `null` means no more reviews in the window. To page through, keep calling with the previous response's `nextCursor` until it is `null`.

**Pagination is keyset (cursor), not offset.** The cursor encodes the `(submittedAt, id)` of the last item on the page, and the next query selects rows strictly after it — so each page is a bounded index range-scan with stable results even as new reviews arrive (no rows skipped or repeated, unlike `OFFSET`). The trailing `id` makes the ordering total so reviews sharing a `submittedAt` paginate deterministically.

**Errors:** `404 NOT_FOUND` if the app is not registered; `400 VALIDATION` if `windowHours`/`limit` are out of range or `cursor` is malformed.

## DTOs

All schemas live in `packages/shared/src/dto/` and are shared with the frontend.

### `AppDto`

```ts
{
  id: string;
  name: string | null;
  country: string;
  createdAt: string;
  claimedAt: string | null;  // ISO timestamp while a worker is currently syncing this app, else null
}
```

`claimedAt` mirrors the worker's claim lease (`apps.claimed_at`) — non-null means a worker is processing this app right now. It is informational only (the web app selector shows a "syncing…" hint); see [`docs/etl.md`](etl.md#multi-worker-safety-the-claim-lease).

### `ReviewDto`

```ts
{
  id: string;
  appId: string;
  author: string;
  title: string;
  content: string;
  rating: number;       // integer 1–5
  version: string | null;
  submittedAt: string;  // ISO 8601
}
```

### `ReviewsPageDto`

```ts
{ items: ReviewDto[]; nextCursor: string | null }
```

One page of reviews. `nextCursor` is an opaque token for the following page (`null` when exhausted).

### `RegisterAppRequest`

```ts
{ appId: string; country?: string }
```

## Error envelope

All error responses use a consistent JSON structure:

```ts
{
  error: {
    code: string;      // "VALIDATION" | "NOT_FOUND" | "INTERNAL"
    message: string;
    details?: unknown; // Zod issue array on VALIDATION errors
  }
}
```

| Scenario | HTTP Status | Code |
|---|---|---|
| Zod parse failure (request body or query params) | `400` | `VALIDATION` |
| App not found | `404` | `NOT_FOUND` |
| Unexpected error | `500` | `INTERNAL` |

Error handling is centralised in `apps/api/src/middleware/error.ts` via Hono's `app.onError`.

## Window hours validation

`windowHours` is validated as any integer in **[1, 8760]** (up to 1 year). The default is `48` (configurable via `REVIEW_WINDOW_HOURS_DEFAULT`). The API composition root builds the validation schema via `makeReviewsQuerySchema(env.REVIEW_WINDOW_HOURS_DEFAULT)` from `@packages/shared`. Values outside the range return `400 VALIDATION`.

The frontend's `WindowPicker` offers **48h / 7d / 30d / 60d / 90d / 1y** as convenience presets (a local FE constant), but the API accepts any integer in range. The default `windowHours=48` returns an empty list for apps whose newest review is older than two days — use a wider window for those. (Apple's feed only spans the ~500 most-recent reviews, so very wide windows surface whatever history the DB has accumulated over time rather than fetching further back.)

See [`docs/architecture.md`](architecture.md) for the composition root and [`docs/frontend.md`](frontend.md) for the matching client-side types.
