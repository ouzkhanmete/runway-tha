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

### `GET /apps/:appId/reviews?windowHours=48`

**Query parameters:**

| Param | Default | Allowed values | Notes |
|---|---|---|---|
| `windowHours` | `48` (env `REVIEW_WINDOW_HOURS_DEFAULT`) | Any integer 1–720 | Out-of-range or non-integer → 400 |

Returns `ReviewDto[]` sorted newest-first (`submittedAt DESC`). Empty array if no reviews exist within the window.

**Errors:** `404 NOT_FOUND` if the app is not registered; `400 VALIDATION` if `windowHours` is outside `[1, 720]`.

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

`windowHours` is validated as any integer in **[1, 720]**. The default is `48` (configurable via `REVIEW_WINDOW_HOURS_DEFAULT`). The API composition root builds the validation schema via `makeReviewsQuerySchema(env.REVIEW_WINDOW_HOURS_DEFAULT)` from `@packages/shared`. Values outside the range return `400 VALIDATION`.

The frontend's `WindowPicker` offers **48h / 7d / 30d** as convenience presets (a local FE constant), but the API accepts any integer in range. The default `windowHours=48` returns an empty list for apps whose newest review is older than two days — use `168` or `720` for those.

See [`docs/architecture.md`](architecture.md) for the composition root and [`docs/frontend.md`](frontend.md) for the matching client-side types.
