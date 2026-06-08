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
