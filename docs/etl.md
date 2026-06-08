# ETL — Worker and RSS Feed

The worker (`apps/worker`) is the **sole writer of `reviews`**. It polls Apple's RSS feed on a configurable schedule and upserts reviews into Postgres.

## RSS feed shape

Apple's customer-reviews endpoint:

```
GET https://itunes.apple.com/{country}/rss/customerreviews/id={appId}/sortBy=mostRecent/page={n}/json
```

- Returns JSON with a `feed.entry` array (or a single object when there is exactly one review on the page — the mapper handles both).
- **50 reviews per page**, sorted most-recent-first.
- **Max 10 pages** (~500 most-recent reviews).
- Each entry is a `FeedEntry` (see `packages/core/src/infrastructure/api-clients/apple-rss.types.ts`):
  - `id.label` — stable numeric review ID (the dedup key)
  - `im:rating.label` — `"1"`–`"5"` (string); absent on the first-entry app-metadata blob
  - `im:version.label` — app version string (may be absent)
  - `author.name.label` — reviewer display name
  - `title.label` — review title
  - `content.label` — review body
  - `updated.label` — ISO 8601 with timezone → stored as `timestamptz`

**Metadata entry:** the very first entry on page 1 is sometimes app metadata rather than a review; it has no `im:rating` field. `mapEntry` returns `null` for it; `mapFeedPage` filters nulls out.

## Review mapper (`apple-rss.mapper.ts`)

`mapEntry(appId, entry)` → `Review | null`

- Returns `null` if `im:rating` is absent (metadata) or non-numeric.
- Casts `im:rating.label` to integer via `parseInt`.
- Maps `updated.label` → `new Date(...)` → `submittedAt`.

`mapFeedPage(appId, json)` handles the single-object edge case, maps all entries, and filters nulls.

## Worker loop

### Configuration knobs (env vars)

| Var | Default | Meaning |
|---|---|---|
| `WORKER_TICK_MS` | `60000` | Interval between scheduler ticks (ms) |
| `WORKER_STALENESS_MS` | `900000` | Minimum milliseconds since last successful sync before an app is re-queued (default 15 min) |
| `WORKER_MAX_PAGES` | `10` | Maximum pages fetched per app per sync |
| `WORKER_CONCURRENCY` | `3` | Max apps synced in parallel per tick |
| `WORKER_MAX_RETRIES` | `3` | Per-page HTTP retry attempts |
| `FEED_BASE_URL` | `https://itunes.apple.com` | Base URL for the RSS feed |

### Tick cycle

`startLoop` fires immediately on startup, then repeats every `WORKER_TICK_MS`. Each tick skips if the previous run is still in progress (no overlapping executions).

Within each tick, `SyncSchedulerService.runDueOnce()`:

1. Computes `staleBefore = now() − WORKER_STALENESS_MS`.
2. Calls `AppRepository.findDueForSync(staleBefore)` → apps with no successful `sync_run` with `finished_at > staleBefore`.
3. Processes due apps in parallel up to `WORKER_CONCURRENCY` using `mapWithConcurrency`.
4. For each app, `IngestReviewsService.ingestApp(app)`:
   - Opens a `sync_run` record (`syncRuns.start`).
   - Calls `AppleRssApiClient.fetchAllPages` — always fetches pages 1–10 (stops early only if a page returns 0 entries).
   - Upserts all collected reviews (`reviewRepo.upsertMany`).
   - Closes the `sync_run` with `status: "success"` and counts, or `status: "error"` with the error message. The run record is always closed, even on failure.
5. A failed app increments `failed` but does not stop other apps from being processed.

### Why always-10-pages?

The Apple feed provides only the ~500 most-recent reviews — there is no pagination state or cursor to maintain. Fetching all pages each sync is cheap (≤ 10 requests) and keeps the local DB consistent with Apple's feed without needing any watermark or change-detection logic. Combined with upsert idempotency, repeated full fetches are safe.

### No startup seeding

The worker is a **pure reader** of the `apps` table. It does not seed or register any apps on startup. Apps are onboarded exclusively via `POST /apps` (API) or the "Add app" form in the web UI. Once an app row exists, the worker picks it up automatically on its next tick.

## HTTP retry and backoff

`AppleRssApiClient.fetchPageWithRetry` retries on HTTP 403, 429, and any 5xx status:

- Up to `WORKER_MAX_RETRIES` retry attempts after the initial request.
- Exponential backoff: `2^(attempt-1) × 50 ms` (50 ms, 100 ms, 200 ms, …).
- Non-retryable errors (e.g. 404) throw immediately.

## Rate-limit analysis

Apple's RSS endpoint has no published rate limits and returns no `X-RateLimit-*` headers. It is edge-cached by Akamai; repeated fetches of the same page often return `TCP_MEM_HIT`.

**Load math — default config (10 apps, 15-min staleness / 900 000 ms):**

| Metric | Value |
|---|---|
| Pages per sync | 10 apps × 10 pages = 100 requests |
| Window | 900 000 ms = 900 s |
| Average rate | 100 / 900 ≈ **0.11 req/s** (~400 req/hr) |

**Empirical tolerance (probed 2026-06-08):** 70 requests (40 sequential + 30 concurrent) produced 0 throttled responses at ~48 req/s.

**Headroom:** default load is roughly 400× below the demonstrated safe throughput. Even scaling to 100 tracked apps yields only ~1.1 req/s — still well within observed limits.

Bounded concurrency (`WORKER_CONCURRENCY=3`) and per-request backoff/retry are present as good-citizenship safeguards regardless.

See [`docs/data-model.md`](data-model.md) for the schema that drives `findDueForSync`.
