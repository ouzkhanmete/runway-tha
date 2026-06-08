# Decisions

Key design decisions and dependency justifications.

## Dependency justification table

| Dependency | Justification |
|---|---|
| **Bun** | Runtime, workspace manager, and test runner in a single tool. Eliminates separate Jest/Vitest and Node+npm setup; built-in SQL driver removes the `pg`/`postgres` npm dependency. |
| **Hono** | Tiny (~15 kB), standards-based (Fetch API / `Request`/`Response`), runs on Bun natively. Zero-overhead routing for a small REST surface. |
| **Drizzle ORM** | Type-safe SQL with full control over queries; supports the Bun-native SQL driver (`drizzle-orm/bun-sql`), so no extra pg dep. Explicit schema-as-code. **Prisma was considered and explicitly avoided** — Prisma requires a separate binary engine and generates a separate client, adding complexity without benefit for this scale. |
| **Zod** | Runtime DTO validation at the API boundary; schemas are isomorphic and reused verbatim on the frontend to parse API responses. Single source of truth for data shapes across the stack. |
| **TanStack Query** | Minimal but complete server-state layer: caching, loading/error states, query key invalidation after mutations. Avoids hand-rolling `useEffect`+`useState` fetch logic. |
| **React + Vite** | Standard SPA toolchain. Vite's built-in dev proxy eliminates any CORS configuration for local development. |
| `fetch` (runtime built-in) | No HTTP library added. Bun's `fetch` is spec-compliant and available globally; the feed client and API client both accept an injectable `fetch` parameter for testability. |
| **date-fns** | Date parsing, formatting, and arithmetic (`parseISO`, `formatISO`, `subHours`, `subMilliseconds`, `formatDistanceToNow`) with explicit, readable call sites instead of raw `Date` arithmetic. |
| **Biome** | All-in-one formatter and import organiser (replaces ESLint + Prettier). Run via `bun run format`. Used solely for readability and consistency; no lint rules are enforced in CI. |

## Design decisions

### Configurable review window (default 48h)

The API and frontend default to a 48h window because the primary use-case is monitoring recent reviews. A narrow default prevents unbounded query results on apps with large review history. The window is any integer in **[1, 8760]** hours (up to 1 year), so users can look back as far as the DB has accumulated. The frontend's `WindowPicker` offers **48h / 7d / 30d / 60d / 90d / 1y** as convenience presets, but the API accepts any value in range. (Apple's RSS feed itself only spans the ~500 most-recent reviews, so windows wider than the feed's reach surface accumulated history rather than fetching further back.)

Apple's RSS feed only provides the ~500 most-recent reviews, so the local DB will not contain older reviews unless they happen to fall within a fetch window — which is why 48h may return zero results for apps with low velocity and is entirely expected.

### Worker as sole writer of `reviews`

The API and worker share the same Postgres instance but have strict role separation: the worker writes reviews and sync_runs; the API reads reviews and writes apps. This avoids concurrent write contention, makes the data-flow easy to reason about, and simplifies auditing (all ingest activity is in `sync_runs`).

### Create-only app registration

`POST /apps` is idempotent — calling it twice with the same `appId` returns the existing row without error. There is no update or delete endpoint. This keeps the control-plane simple: apps are registered once and thereafter the worker owns their lifecycle. Deleting an app from tracking would require a direct DB operation (out of scope for a local demo).

### Table-driven worker onboarding

Adding a new app to track requires only one INSERT (via `POST /apps`). The worker's `claimDueForSync` query discovers it automatically on the next tick without any configuration reload or restart. This is the table-driven pattern: the database is the source of truth for which apps to process.

### App name from the iTunes Lookup API; resolved at registration

The customer-reviews RSS feed the worker calls does **not** include the app's name, so a separate source is needed. We use the **iTunes Lookup API** (`/lookup?id=…` → `{ resultCount, results: [{ trackName }] }`), called **once at registration time** inside `AppRegistryService.register` — synchronously, before the app row is inserted. The one call does double duty: `resultCount` validates that the app exists (a numeric-but-nonexistent id is rejected with `400 VALIDATION` "App not found…") and `trackName` gives the display name, which is written to `apps.name` on insert. So a registered app always has its name immediately; the worker does no name resolution at all.

Why the lookup API rather than "fetch one page of the reviews feed to check existence"? The reviews feed can't do either job: it returns HTTP 200 with an **empty feed** for a non-existent id — indistinguishable from a real app that simply has no recent reviews — and it carries **no app name** (`feed.title` is the generic `"iTunes Store: Customer Reviews"`). The lookup API answers both existence and name in a single call. This keeps one rule everywhere — *register resolves the name and existence* — so manual `POST /apps`, the form, and the top-apps seed all behave identically (the seed onboards each id through `register` too).

### Seeding via a one-shot container, gated before the app services

The full-stack demo pre-populates the current top-free apps so a reviewer sees data immediately. This runs as a dedicated `seed` service that completes **before** the worker/api start (compose `depends_on … service_completed_successfully`), rather than inside the worker — keeping the worker a pure reader and making "the DB is seeded" an explicit, ordered startup step. Each seeded id is onboarded **through `register`** (the same path as a manual add), so seeded apps are existence-checked and get their names at seed time. It's idempotent (skips existing ids) and never blocks startup if the feed is down.

### Database-enforced claim over an external queue

The worker uses a Postgres claim (`apps.claimed_at` + `UPDATE … FOR UPDATE SKIP LOCKED`) to coordinate multiple instances, rather than introducing a job queue (Redis/SQS/etc.). Rationale: the database is already the source of truth and is already a dependency, the work-set is small (one row per tracked app), and `SKIP LOCKED` is the canonical, well-understood Postgres idiom for exactly-once-ish job claiming. This keeps the system single-dependency and the claim logic colocated with the data it guards. The lease is advisory for *efficiency* (avoiding duplicate fetches); idempotent upserts mean *correctness* never depends on it. A dedicated queue would add operational surface for no benefit at this scale. See [`docs/etl.md`](etl.md#multi-worker-safety-the-claim-lease).

### Keyset (cursor) pagination over OFFSET

Reviews are paged with a keyset cursor — `WHERE (submitted_at, id) < (?, ?) ORDER BY submitted_at DESC, id DESC LIMIT n` — rather than `LIMIT/OFFSET`. Two reasons: (1) **performance** — OFFSET makes the database scan and discard all skipped rows, so deep pages get linearly slower; a keyset cursor is always a bounded range scan off the `(app_id, submitted_at DESC, id DESC)` index. (2) **stability** — the feed is continuously ingesting new reviews, and OFFSET would skip or duplicate rows when the underlying set shifts between requests; a keyset anchored to `(submitted_at, id)` returns a consistent, gap-free sequence. The trailing `id` is the tiebreaker that makes the sort order total (timestamps can collide), which is what keeps the cursor unambiguous. The cursor is returned as an opaque base64url token so clients don't depend on its shape.

### Bun-native SQL driver over `pg`

`drizzle-orm/bun-sql` uses Bun's built-in `SQL` class, which is a first-class Bun API backed by libpq. This removes the need for an npm postgres driver entirely. The trade-off is that the server-side code (packages/core, apps/api, apps/worker) is Bun-only and will not run on Node.

### No DI library

Constructor injection with plain interfaces is sufficient for this scale. Every dependency is explicit in the composition root; there is no reflection, decorator magic, or container to understand. The composition roots are short enough to read at a glance.

### Restart-safety without a cursor

Because Apple assigns stable numeric IDs to reviews and the upsert uses that ID as the PK, the worker does not need to track a high-water mark. Every sync fetches all pages and upserts everything. If the worker crashes mid-sync, the next tick re-fetches and upserts the same data — `ON CONFLICT DO UPDATE` makes this safe and correct.

See [`docs/architecture.md`](architecture.md) for the layering rationale and [`docs/etl.md`](etl.md) for the full worker design.
