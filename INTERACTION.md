# Interaction Log

This file documents how the project was built with **Claude Code**. Each entry is a user prompt (the **input**) followed by a brief summary of **what changed** that turn. It is part of the deliverable: a transparent, human-in-the-loop record of the AI-assisted workflow.

> Convention: one entry per meaningful turn; every turn also produces a single conventional commit to `main`.

---

## Turn 1 — Planning & Design (2026-06-08)

**Prompt (the original brief):**

> We are going to build a solution for a take-home-assessment. This is a demo only, no deployment, no github actions/workflows, everything is running locally. Build with Claude Code so Claude.md is required. Also a `docs/` folder explaining how parts of the system work, mapped onto CLAUDE.md as a table (file · why · when). Dump every prompt + a brief summary of changes into `INTERACTION.md`, this prompt included as the first.
>
> 1. **Requirements** — the hard requirements doc (Recent iOS App Store reviews viewer).
> 2. **Tech stack** — BE: Bun + TS + Hono, Postgres (latest, 18), an ORM that is not Prisma (Drizzle). Patterns: composition root + native-constructor DI, repository pattern for DB access, Zod DTOs on the API layer, clean-architecture-ish layering. FE: React + a state management tool (TanStack or Zustand), no auth. Bun monorepo with a shared package.
> 3. **Infra** — docker-compose: local infra, test infra (separate port), and full dockerized setup.
> 4. **Test coverage** — Bun's native runner: unit for pure fns, mocked-network for 3rd-party requests, unit/int for services, **integration with a real dockerized DB for repositories**, plus e2e for the API contract.
> 5. **API design** — explore the RSS feed (pagination?), consider an ETL job parsing the feed regularly with our DB as the source of truth.
> 6. **Git** — conventional commits (no scope), an INTERACTION.md entry + commit per turn straight to `main`, initialize the existing empty GitHub repo via `gh`.
>
> Follow-up refinements in the same planning session:
> 1. git-ignore `docs/superpowers`.
> 2. Make the worker **table-driven**: read `apps ⨝ sync_runs`, find apps with no successful run inside the staleness window; onboarding an app = a single insert that the next worker batch picks up.
> 3. Worker always fetches all **10 pages**.
> 4. Investigate the RSS feed's rate limits and compute load for 10 apps × 10 pages.

**Decisions reached (via brainstorming):** multi-app via config seed **+ `POST /apps` create-only** registration and an FE selector; ETL lives in a **separate `worker` app**; time window **configurable (default 48h)** with an FE picker (48h / 7d / 30d); **worker is the sole writer of reviews** (API only reads reviews and writes the `apps` row).

**What changed this turn:**
- Used the **brainstorming** skill to turn the brief into an approved design.
- **Explored the App Store RSS feed empirically:** JSON feed, 50 reviews/page × max 10 pages (≈500 most-recent), stable review `id` (dedup/idempotency key), field mapping, and the "newest live review is days old" reality that motivates a configurable window.
- **Probed rate limits:** no published limits, Akamai-edge-cached; 70 requests (40 sequential + 30 concurrent) with 0 throttling; worst-case load ≈ 0.11 req/s (400 req/hr) for 10 apps × 10 pages — ~400× under demonstrated-safe throughput.
- Wrote the **design spec** to `docs/superpowers/specs/2026-06-08-app-store-reviews-viewer-design.md` (git-ignored working artifact).
- **Initialized the repository:** `.gitignore`, `README.md`, this log, and an initial `CLAUDE.md`; first commit pushed to `main` on `git@github.com:ouzkhanmete/runway-tha.git`.

---

## Turn 2 — Execute: Wave 0 Foundation (2026-06-08)

**Prompt:** "subagents, 2 works for me, start." (Chose subagent-driven execution with 2 parallel role-lanes — Backend ∥ Frontend — gated by orchestrator waves.)

**Approach:** wrote the implementation plan (`docs/superpowers/plans/…`, git-ignored) with an explicit parallelization strategy — **2 parallel role agents** (`Agent BE`, `Agent FE`) + an orchestrator that runs the conflict-prone shared work (foundation, integration) and owns all commits to `main`. Reasoning: the build has a sequential spine (`shared`+infra → `core` → `api`/`worker`); the one token-efficient parallel cut is **server vs web** (they share only the Zod DTO contract), so the whole FE lane overlaps the BE lane with zero merge conflicts.

**What changed (Wave 0, foundation — built by a single subagent, verified + committed by the orchestrator):**
- Bun workspace monorepo: root `package.json` (workspaces + scripts), `tsconfig.base.json`, package/app stubs, **all dependencies pre-installed** in one pass so the parallel lanes never run `bun install` concurrently.
- `packages/shared`: Zod DTOs (`ReviewDto`, `AppDto`, `RegisterAppRequest`, `ReviewsQuery`, `ApiError`) — TDD, 7 tests green.
- Infra: `docker/docker-compose.yml` (local PG 18) + `docker-compose.test.yml` (test PG 18 on :5433). Caught a **postgres:18 data-dir change** — mount must be `/var/lib/postgresql`, not `/…/data`, or pg18 won't start.
- `packages/core`: Drizzle schema (`apps`, `reviews`, `sync_runs` + recent-index), **Bun-native SQL driver** (`drizzle-orm/bun-sql`, no `pg` dependency), env loader, initial migration, and a dockerized test-DB harness (`ensureMigrated` / `truncateAll`) + RSS fixtures.
- Verified: `bun test` 8/8 green; migration generates 3 tables + index; test DB migrates against real dockerized Postgres. Committed in 5 conventional commits.

---

## Turn 3 — Execute: Wave 1 (core + web, in parallel) (2026-06-08)

**Prompt:** (continuation of the execution loop) — ran the two role-lanes concurrently.

**What changed (Wave 1 — `Agent BE` and `Agent FE` dispatched in parallel, both TDD; orchestrator reviewed, fixed, and committed):**
- **`packages/core` (Agent BE):** domain entities + repository/feed-client **ports**; pure RSS→domain **mapper** (skips the rating-less metadata entry); **`AppStoreFeedClient`** (paginates 10 pages, exponential backoff/retry on 403/429/5xx — unit-tested with injected `fetch`); **Drizzle repositories** (integration-tested against real PG — **idempotent upsert proves restart-safety**, newest-first window query, `findDueForSync` staleness logic); **services** (`IngestReviewsService`, `ReviewQueryService`, `AppRegistryService`). 42 tests.
- **`apps/web` (Agent FE):** Vite + React + TanStack Query shell with a `/api` dev proxy; typed **API client** (Zod-parses responses); query **hooks**; **components** (rating stars, review card with relative+absolute time, list with loading/empty/error states, app selector, add-app form, window picker). 15 tests (happy-dom).
- **Orchestrator review caught a real defect:** BE had named the concrete repository classes identically to the port interfaces (ambiguous `@runway/core` re-exports) — sent the agent back to rename them to `Drizzle*Repository`. Also shed unused `React` imports in the FE.
- Verified end-to-end: **64/64 tests green**, core + web type-checks clean. Committed in 7 conventional commits.

---

## Turn 4 — Execute: Wave 2 (worker + API) & Wave 3 (integration, docs, review) (2026-06-08)

**Prompt:** (continuation of the execution loop)

**Wave 2 — `apps/worker` + `apps/api` (Agent BE):** bounded-concurrency `SyncSchedulerService`; the **table-driven worker** (tick + staleness, seeds `SEED_APP_IDS`, graceful shutdown); the **Hono API** (`/health`, `GET/POST /apps`, `GET /apps/:id/reviews`) with DTO mappers + a central error envelope; API e2e against the real test DB. A real-feed smoke ingested **500 live reviews**. Then verified the whole backend live: `48h → 0` reviews (newest is ~6 days old — validates the configurable window), `720h → 6`, newest-first with all required fields, bad window → 400, unknown app → 404.

**Wave 3 — integration + docs (Agents INFRA ∥ DOCS):** full `docker-compose.full.yml` + Dockerfiles (postgres + migrate + worker + api + web) — **verified serving reviews end-to-end through the web→api proxy**; a worker→DB→API **cross-seam e2e**; the complete `docs/` set + CLAUDE.md doc-map + README quick-start.

**Final review (most-capable model) + fixes:** a holistic review found **no blockers** (all 6 requirements met, clean architecture confirmed) and flagged quality items I then fixed:
- Push the 48h window filter into SQL (was filtering in memory) so the recent-index is actually used.
- Make the window allow-list **genuinely env-configurable** (`REVIEW_WINDOW_HOURS_*` now drive a schema built at the API composition root — proven live: a custom `48,72` set accepts 72 and rejects 168) and corrected the doc that had claimed this.
- `await` app seeding before the first worker tick (was a first-boot race).
- Type the RSS mapper with `FeedEntry` + guard malformed entries.
- Fix `bun run migrate` to resolve `DATABASE_URL` via the env loader (was undefined under `--cwd`).

**Result:** **81/81 tests green**, all five packages type-check clean, API verified **20/20 reliable** against a live DB, full docker stack verified. Committed across Waves 2–3 + 5 fix commits.

---

## Turn 5 — Polish pass: 14 refinements, run as a parallel subagent fleet (2026-06-08)

**Prompt:** a list of 14 code-quality refinements (controller classes, clearer Dockerfile names, colocated tests, `abc.repository.ts`-style naming, range-based window with no allow-list, Biome, DTO file renames, split `ports/` into `repositories/`+`api-clients/`, a repository factory, date-fns, enums over magic strings, path aliases, drop worker seeding, ms-based staleness) — *"spawn a set of subagents to do the polishing in parallel."* Plus four mid-flight follow-ups (full ISO `Country` enum; consolidate to `@packages/*`/`@apps/*` aliases; idempotent init migration; review indexes for the access patterns).

**Approach (orchestrated waves over disjoint dirs):**
- **Phase 0 (orchestrator):** Biome config, the `@packages/*`/`@apps/*` tsconfig aliases (after probing that Bun resolves them transitively), env-var cleanup, deps (`@biomejs/biome`, `date-fns`), and the small `packages/shared` contract (full **249-code ISO `Country` enum**, `makeReviewsQuerySchema` accepting any int **1–720**, default 48).
- **Phase 1 (`core` ∥ `docker`):** restructured `packages/core` — `application/repositories/` + `application/api-clients/`, `AppleRssApiClient`, a `createRepositories(db)` **factory**, `SyncStatus`/`Country` enums, **date-fns** date handling, **ms** staleness, env cleanup, colocated tests; renamed Dockerfiles → `backend`/`frontend`.
- **Orchestrator:** rewrote `packages/core` imports to the new aliases; added a `sync_runs (app_id, status, finished_at)` index for the staleness query; **regenerated the init migration as idempotent** (`CREATE … IF NOT EXISTS`, FK `ADD CONSTRAINT` in `DO/EXCEPTION` blocks — verified re-runnable) and confirmed `reviews.id` PK is the unique index the upsert needs.
- **Phase 2 (`api` ∥ `worker` ∥ `web`):** API **controller classes**; worker **reads the apps table only** (seeding removed — apps onboarded via `POST /apps`); web moved to **date-fns** + Vite alias resolution; tests colocated.
- **Phase 3 (orchestrator):** `bun run format` (Biome, 55 files), a docs-update agent, and verification.

**What changed:** the whole monorepo, restructured per the 14 items + 4 follow-ups, then **Biome-formatted**.

**Verified live:** **82/82 tests green**, all five packages type-check clean; the **no-seeding flow** end-to-end (register via `POST /apps` → worker's tick ingests → 6 reviews newest-first); window now accepts **any 1–720** (200 ok, 721/0 → 400); the **dockerized full stack** (renamed Dockerfiles) served reviews through the web→api proxy (worker `processed: 1`). Committed in 9 conventional commits.

---

## Turn 6 — Worker hardening: no-overlap loop + multi-worker claim lease (2026-06-08)

**Prompt:** improve the worker — (1) make sure `setInterval` ticks never overlap if one run becomes stale; (2) make it safe to run multiple workers by claiming an app with an atomic update+return in an isolated transaction (so two workers never pick the same id), with a "pending"-style status that still relies on a timestamp so a stuck claim is retried after N, for visibility into what's running now; (3) lower the check interval to 30 s for snappy demo pickup while keeping the 15 min cooldown.

**What changed:**
- **No overlap by construction** — replaced `setInterval` + re-entrancy guard with a **self-rescheduling `setTimeout`** loop (`apps/worker/src/scheduler-loop.ts`): the next tick is scheduled only after the current one settles. Added `scheduler-loop.test.ts` proving no two ticks run concurrently even when a tick outlasts the interval, and that `stop()` halts the loop.
- **Atomic claim lease for multi-worker safety** — added an `apps.claimed_at` lease column (additive idempotent migration `0001`, `ADD COLUMN IF NOT EXISTS`). `findDueForSync` became **`claimDueForSync`**: a single `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED) … RETURNING` statement that claims due apps and stamps `claimed_at`, so concurrent workers never grab the same app. `SKIP LOCKED` covers the simultaneous window; the `claimed_at` timestamp covers the after-commit window. Added `releaseClaim`; the scheduler releases the lease in a `finally` after each app (success **or** error), and a claim older than `WORKER_CLAIM_TTL_MS` (new env, default 5 min) is reclaimed as stuck (crash recovery). Surfaced `claimedAt` on `AppDto` + a "syncing…" hint in the web app selector for visibility.
- **Demo cadence** — `WORKER_TICK_MS` default/`.env`/compose → **30 s**; `WORKER_STALENESS_MS` stays **15 min**. New apps are discovered within 30 s; an already-synced app isn't re-fetched until the cooldown elapses.
- **Docs** — `etl.md` (new "Multi-worker safety: the claim lease" section + self-scheduling loop + config table), `data-model.md` (`claimed_at`, index rationale, additive idempotent migration), `api.md` (`claimedAt` on `AppDto`), `decisions.md` (DB claim over an external queue), `testing.md` + `CLAUDE.md` invariants + test count → **89**.

**Verified live:** **89/89 tests green** (incl. a real-Postgres integration test asserting two concurrent claims never grab the same app, and the back-to-back no-overlap loop test); all five packages type-check clean; migration `0001` applied to the dev DB and confirmed re-runnable; a one-shot live tick against the real Apple feed ran **claim → ingest (10 pages / ~450 reviews) → release**, leaving `claimed_at` back to `NULL`. Biome-formatted.

---

## Turn 7 — UX + pagination pass: URL state, more windows, cursor pagination, fast first sync (2026-06-08)

**Prompt:** five improvements (plus questions): (1) put the selected app in `?appId=` so a refresh preserves it; (2) read the query param as the source of truth; (3) schedule a faster first sync after adding an app with a tiny loader, and lower the interval to 10 s; (4) add 60d/90d/1y windows; (5) cursor-based (not offset) pagination, 5 reviews/page, scroll-triggered, sorted by date with an index. Plus: is there an API to discover app ids to test with?

**Answered:** keyset pagination needs a total order → sort by `(submitted_at, id)` with a matching index. App-id discovery: the **iTunes Search API** (`/search?term=…&entity=software` → `trackId`) and the **top-apps RSS** (`im:id`), both verified live.

**What changed (4 feature commits):**
- **Windows** — added 60d/90d/1y presets; raised `MAX_WINDOW_HOURS` 720 → 8760 (1 year).
- **URL as source of truth** — new `useQueryParam` hook binds the selected app to `?appId=` (push on select, replace for the default, `popstate`-aware); URL logic in pure helpers (`readParam`/`buildParamUrl`) unit-tested without a DOM (happy-dom doesn't link history → location).
- **Cursor pagination** — reviews endpoint now returns `{ items, nextCursor }` with `limit` (default 5) + opaque `cursor`; keyset `WHERE (submitted_at, id) < (?, ?) ORDER BY submitted_at DESC, id DESC LIMIT n+1`; index extended to `(app_id, submitted_at DESC, id DESC)` via idempotent migration `0002`; `findRecent` → `findRecentPage`, `getRecentPage`; new `ValidationError` → 400 on malformed cursor; web `useReviews` → `useInfiniteQuery` with an IntersectionObserver sentinel ("Loading more…" / "You've reached the end.").
- **Fast first sync** — `WORKER_TICK_MS` 30 s → 10 s; `AddAppForm` `onAdded` selects the new app and `App.tsx` polls (`pollUntilData`) with a "Fetching the latest reviews…" loader until the first batch lands (30s ceiling).
- **Docs** — `api.md`, `data-model.md`, `decisions.md` (keyset over OFFSET), `frontend.md`, `testing.md`, plus `architecture.md`/`CLAUDE.md` window/count touch-ups.

**Verified:** **102/102 tests green** (repo walks every page with no gaps/repeats + id tie-break determinism; e2e covers cursor pagination, explicit limit, malformed-cursor 400); all five packages type-check clean; Biome-formatted.
