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

The API and frontend default to a 48h window because the primary use-case is monitoring recent reviews. A narrow default prevents unbounded query results on apps with large review history. The window is any integer in **[1, 720]** hours, so users can look back as far as needed (up to the 30-day / 500-review limit of the Apple RSS feed). The frontend's `WindowPicker` offers **48h / 7d / 30d** as convenience presets, but the API accepts any value in range.

Apple's RSS feed only provides the ~500 most-recent reviews, so the local DB will not contain older reviews unless they happen to fall within a fetch window — which is why 48h may return zero results for apps with low velocity and is entirely expected.

### Worker as sole writer of `reviews`

The API and worker share the same Postgres instance but have strict role separation: the worker writes reviews and sync_runs; the API reads reviews and writes apps. This avoids concurrent write contention, makes the data-flow easy to reason about, and simplifies auditing (all ingest activity is in `sync_runs`).

### Create-only app registration

`POST /apps` is idempotent — calling it twice with the same `appId` returns the existing row without error. There is no update or delete endpoint. This keeps the control-plane simple: apps are registered once and thereafter the worker owns their lifecycle. Deleting an app from tracking would require a direct DB operation (out of scope for a local demo).

### Table-driven worker onboarding

Adding a new app to track requires only one INSERT (via `POST /apps`). The worker's `claimDueForSync` query discovers it automatically on the next tick without any configuration reload or restart. This is the table-driven pattern: the database is the source of truth for which apps to process.

### Database-enforced claim over an external queue

The worker uses a Postgres claim (`apps.claimed_at` + `UPDATE … FOR UPDATE SKIP LOCKED`) to coordinate multiple instances, rather than introducing a job queue (Redis/SQS/etc.). Rationale: the database is already the source of truth and is already a dependency, the work-set is small (one row per tracked app), and `SKIP LOCKED` is the canonical, well-understood Postgres idiom for exactly-once-ish job claiming. This keeps the system single-dependency and the claim logic colocated with the data it guards. The lease is advisory for *efficiency* (avoiding duplicate fetches); idempotent upserts mean *correctness* never depends on it. A dedicated queue would add operational surface for no benefit at this scale. See [`docs/etl.md`](etl.md#multi-worker-safety-the-claim-lease).

### Bun-native SQL driver over `pg`

`drizzle-orm/bun-sql` uses Bun's built-in `SQL` class, which is a first-class Bun API backed by libpq. This removes the need for an npm postgres driver entirely. The trade-off is that the server-side code (packages/core, apps/api, apps/worker) is Bun-only and will not run on Node.

### No DI library

Constructor injection with plain interfaces is sufficient for this scale. Every dependency is explicit in the composition root; there is no reflection, decorator magic, or container to understand. The composition roots are short enough to read at a glance.

### Restart-safety without a cursor

Because Apple assigns stable numeric IDs to reviews and the upsert uses that ID as the PK, the worker does not need to track a high-water mark. Every sync fetches all pages and upserts everything. If the worker crashes mid-sync, the next tick re-fetches and upserts the same data — `ON CONFLICT DO UPDATE` makes this safe and correct.

See [`docs/architecture.md`](architecture.md) for the layering rationale and [`docs/etl.md`](etl.md) for the full worker design.
