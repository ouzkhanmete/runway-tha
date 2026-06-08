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
| `WORKER_TICK_MS` | `10000` | Gap between scheduler ticks (ms). Lowered to 10 s so a newly-registered app is picked up quickly in the demo. |
| `WORKER_STALENESS_MS` | `900000` | Minimum milliseconds since last successful sync before an app is re-queued (the cooldown, default 15 min) |
| `WORKER_CLAIM_TTL_MS` | `300000` | How long a claim lease is honored before it is treated as stuck (crashed worker) and may be reclaimed (default 5 min) |
| `WORKER_MAX_PAGES` | `10` | Maximum pages fetched per app per sync |
| `WORKER_CONCURRENCY` | `3` | Max apps synced in parallel per tick |
| `WORKER_MAX_RETRIES` | `3` | Per-page HTTP retry attempts |
| `FEED_BASE_URL` | `https://itunes.apple.com` | Base URL for the RSS feed |

Note that `WORKER_TICK_MS` (how often we *look* for work) is independent of `WORKER_STALENESS_MS` (how often a given app is actually *re-synced*). A 10 s tick with a 15 min cooldown means new apps are discovered within 10 s, but an already-synced app is not re-fetched until 15 min have passed. The web app pairs this with a poll-until-loaded spinner after you add an app, so its first reviews appear automatically.

### Tick cycle — no overlap by construction

`startLoop` uses a **self-rescheduling `setTimeout`**, not `setInterval`: the next tick is scheduled only *after* the current one fully settles (`apps/worker/src/scheduler-loop.ts`). A slow or stalled tick therefore delays the next one instead of stacking up behind it — overlapping runs are impossible by construction, and the gap between runs is always `WORKER_TICK_MS`.

Within each tick, `SyncSchedulerService.runDueOnce()`:

1. Computes `staleBefore = now() − WORKER_STALENESS_MS` and `claimExpiredBefore = now() − WORKER_CLAIM_TTL_MS`.
2. Calls `AppRepository.claimDueForSync(...)` — a single atomic statement that **claims** the due apps (see [Multi-worker safety](#multi-worker-safety-the-claim-lease) below) and stamps each with `claimed_at = now()`.
3. Processes claimed apps in parallel up to `WORKER_CONCURRENCY` using `mapWithConcurrency`.
4. For each app, `IngestReviewsService.ingestApp(app)`:
   - Opens a `sync_run` record (`syncRuns.start`).
   - Calls `AppleRssApiClient.fetchAllPages` — always fetches pages 1–10 (stops early only if a page returns 0 entries).
   - Upserts all collected reviews (`reviewRepo.upsertMany`).
   - Closes the `sync_run` with `status: "success"` and counts, or `status: "error"` with the error message. The run record is always closed, even on failure.
5. After each app finishes (success **or** error), the scheduler calls `AppRepository.releaseClaim(app.id)` to clear the lease. A failed app increments `failed` but does not stop other apps from being processed.

### Multi-worker safety: the claim lease

The worker is safe to run as **multiple concurrent instances** (e.g. for throughput or rolling restarts). Two workers ticking at the same time must never both process the same app — that would mean duplicate feed fetches and racing `sync_run` rows. Idempotent upserts keep the *data* correct either way, but we avoid the wasted work entirely with a database-enforced claim.

`apps.claimed_at` is a **lease column**. The claim is one atomic statement:

```sql
UPDATE apps SET claimed_at = now()
FROM (
  SELECT a.id FROM apps a
  WHERE NOT EXISTS (                       -- cooldown: no successful run within the window
          SELECT 1 FROM sync_runs s
          WHERE s.app_id = a.id AND s.status = 'success' AND s.finished_at > :staleBefore)
    AND (a.claimed_at IS NULL OR a.claimed_at < :claimExpiredBefore)  -- free, or a stuck lease
  FOR UPDATE SKIP LOCKED                    -- concurrent claims skip rows already locked
) AS due
WHERE apps.id = due.id
RETURNING apps.*;
```

Two mechanisms combine to guarantee single-ownership:

- **`FOR UPDATE SKIP LOCKED`** handles the *simultaneous* window: whichever worker reaches a row first row-locks it; a concurrent worker's identical statement skips the locked row rather than blocking.
- **`claimed_at`** handles the *after-commit* window: once a worker has stamped a fresh `claimed_at`, the `claimed_at IS NULL OR claimed_at < claimExpiredBefore` predicate excludes that app from any later claim until the cooldown elapses.

The lease is released (`claimed_at → NULL`) when the sync finishes. If a worker **crashes** mid-sync, the lease is never released — but it becomes reclaimable once it is older than `WORKER_CLAIM_TTL_MS`, so a stuck app self-heals on a later tick. `claimed_at` is also surfaced on `AppDto` (and the web app selector shows "syncing…") purely for visibility into which apps are being processed right now; correctness relies on the timestamp, not on that label.

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

See [`docs/data-model.md`](data-model.md) for the schema that drives `claimDueForSync`.
