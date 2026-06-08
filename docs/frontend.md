# Frontend

React + Vite + TanStack Query SPA (`apps/web`). Served on port `5173`. All data fetching goes through `/api` which Vite proxies to the API server.

## Structure

```
apps/web/src/
  api/client.ts          Typed API client (Zod-parsed responses)
  hooks/
    useApps.ts           TanStack Query: GET /apps
    useReviews.ts        TanStack Query: GET /apps/:appId/reviews
    useRegisterApp.ts    TanStack Mutation: POST /apps
  components/
    AddAppForm.tsx        Form to register a new app by numeric ID
    AppSelector.tsx       Dropdown to pick the active app
    WindowPicker.tsx      Button group: 48h / 7d / 30d
    ReviewCard.tsx        Single review with stars, relative+absolute time
    ReviewList.tsx        List with loading / empty / error states
    RatingStars.tsx       Star rating display
  App.tsx                 Root component — wires state and layout
```

## API client (`api/client.ts`)

`createApiClient()` returns three methods, each Zod-parsing the response against the schemas from `@packages/shared`:

| Method | Endpoint | Returns |
|---|---|---|
| `getApps()` | `GET /api/apps` | `AppDto[]` |
| `registerApp(appId, country?)` | `POST /api/apps` | `AppDto` |
| `getReviews(appId, windowHours, cursor?)` | `GET /api/apps/:appId/reviews?windowHours=…&cursor=…` | `ReviewsPageDto` (`{ items, nextCursor }`) |

On non-2xx responses the client parses the `ApiErrorSchema` error envelope and throws with the server's `error.message`; unrecognised bodies throw `"Request failed (${status})"`.

A module-level singleton `apiClient = createApiClient()` is used by all hooks. The `fetch` and `baseUrl` are injectable for testing.

## TanStack Query hooks

| Hook | Query key | Behaviour |
|---|---|---|
| `useApps()` | `["apps"]` | Fetches on mount; no polling |
| `useReviews(appId, windowHours)` | `["reviews", appId, windowHours]` | **`useInfiniteQuery`** — cursor pagination (5/page); `getNextPageParam` reads `nextCursor`; disabled until `appId` is defined |
| `useRegisterApp()` | — (mutation) | On success, invalidates `["apps"]` to refresh the app list |

`useReviews` returns infinite-query data as `data.pages` (each a `ReviewsPageDto`); `App.tsx` flattens them with `pages.flatMap(p => p.items)`. The `ReviewList` renders the flat list plus a sentinel `<div>` watched by an `IntersectionObserver` that calls `fetchNextPage()` when it scrolls into view (200px root margin), showing a "Loading more…" spinner while fetching and "You've reached the end." when `hasNextPage` is false.

## Components

### `App.tsx`

Root component. State:

- `selectedAppId` — backed by the **`?appId=` URL query param** via `useQueryParam` (the URL is the source of truth), so the selection survives a refresh and is shareable. If the URL names no app — or one that no longer exists — it defaults to the first app via `history.replaceState` (no spurious history entry). Picking an app in the `AppSelector` pushes a new history entry, so back/forward moves between apps.
- `windowHours` — defaults to `48`.

`useQueryParam` keeps the URL logic in pure helpers (`readParam`, `buildParamUrl`) that are unit-tested directly; the hook itself is thin glue over `window.history` + a `popstate` listener.

Renders the control bar (`AddAppForm`, `AppSelector`, `WindowPicker`) and the `ReviewList`.

### `AddAppForm`

Text input + submit button. Calls `useRegisterApp` with the trimmed input value. Clears the input on success and fires `onAdded(appId)`. Shows the error message inline on failure. The `pattern="\d+"` attribute provides browser-level hint for numeric-only input.

On `onAdded`, `App.tsx` selects the new app and marks it `pendingAppId`. While pending, `useReviews` is given `pollUntilData` so it refetches every ~2.5s until the worker's next tick (≤10s) ingests the first reviews, and `ReviewList` shows a "Fetching the latest reviews…" loader instead of the empty state. The wait is cleared when reviews arrive or after a 30s ceiling.

### `WindowPicker`

Six toggle buttons: **48h** (48), **7d** (168), **30d** (720), **60d** (1440), **90d** (2160), **1y** (8760 hours). These are convenience presets defined as a local FE constant; the API accepts any integer in [1, 8760]. Selecting a different window triggers a new query via the `windowHours` key change in `useReviews`.

### `ReviewCard`

Displays a single `ReviewDto`:

- `RatingStars` renders filled/empty stars for the 1–5 integer rating.
- Time is shown as both a human-readable relative string (e.g. "3 days ago") via `Intl.RelativeTimeFormat` and the full locale-formatted absolute time inside an `<abbr title>`.
- App version is shown when present.

### `ReviewList`

Three states:

1. **Loading** — spinner.
2. **Error** — error message.
3. **Empty** — "No reviews found" with a prompt to try a wider window. This is the expected state for apps with low review velocity when the default 48h window is selected.

## Vite proxy

In development, `vite.config.ts` proxies `/api/*` to `http://localhost:3000` and strips the `/api` prefix, so the frontend can call `/api/apps` and the API handles `/apps`.

In the full Docker stack (`docker-compose.full.yml`), the web container runs `vite preview` on port `5173`. The `API_PROXY_TARGET` environment variable (`http://api:3000`) is consumed by the production preview server to forward `/api` requests to the api container.

## 48h window and empty state

The default `windowHours=48` is intentional: it surfaces only very recent reviews, which is the typical monitoring use-case. For apps with lower review velocity (e.g. the sample app `595068606`) the 48h window will frequently return zero results. The empty state copy explicitly tells users to try the 7d or 30d windows.

See [`docs/api.md`](api.md) for the window range and server-side validation.
