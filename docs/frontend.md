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

`createApiClient()` returns three methods, each Zod-parsing the response against the schemas from `@runway/shared`:

| Method | Endpoint | Returns |
|---|---|---|
| `getApps()` | `GET /api/apps` | `AppDto[]` |
| `registerApp(appId, country?)` | `POST /api/apps` | `AppDto` |
| `getReviews(appId, windowHours)` | `GET /api/apps/:appId/reviews?windowHours=…` | `ReviewDto[]` |

On non-2xx responses the client parses the `ApiErrorSchema` error envelope and throws with the server's `error.message`; unrecognised bodies throw `"Request failed (${status})"`.

A module-level singleton `apiClient = createApiClient()` is used by all hooks. The `fetch` and `baseUrl` are injectable for testing.

## TanStack Query hooks

| Hook | Query key | Behaviour |
|---|---|---|
| `useApps()` | `["apps"]` | Fetches on mount; no polling |
| `useReviews(appId, windowHours)` | `["reviews", appId, windowHours]` | Disabled until `appId` is defined |
| `useRegisterApp()` | — (mutation) | On success, invalidates `["apps"]` to refresh the app list |

## Components

### `App.tsx`

Root component. Holds two pieces of state:

- `selectedAppId` — defaults to the first app once `useApps` resolves.
- `windowHours` — defaults to `48`.

Renders the control bar (`AddAppForm`, `AppSelector`, `WindowPicker`) and the `ReviewList`.

### `AddAppForm`

Text input + submit button. Calls `useRegisterApp` with the trimmed input value. Clears the input on success. Shows the error message inline on failure. The `pattern="\d+"` attribute provides browser-level hint for numeric-only input.

### `WindowPicker`

Three toggle buttons: **48h** (48 hours), **7d** (168 hours), **30d** (720 hours). Values match the allowed set enforced by the API. Selecting a different window triggers a new query via the `windowHours` key change in `useReviews`.

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

See [`docs/api.md`](api.md) for the allowed window values and server-side validation.
