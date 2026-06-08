# Infra

All infrastructure is Docker Compose. No CI; local demo only.

## Compose files

| File | Purpose | When to use |
|---|---|---|
| `docker/docker-compose.yml` | Local development Postgres (port `5432`) | Run alongside `dev:api`, `dev:worker`, `dev:web` |
| `docker/docker-compose.test.yml` | Test Postgres (port `5433`, tmpfs, DB `runway_test`) | Required before running integration/e2e tests |
| `docker/docker-compose.full.yml` | Complete stack — postgres + migrate + worker + api + web | One-command demo; no local tooling needed beyond Docker |

### `docker-compose.yml` (dev)

- PostgreSQL 18 on host port `5432`.
- DB: `runway`, user: `runway`, password: `runway`.
- **Persistence:** bind-mounted to `./.data/postgres-dev` in the repo root (gitignored) — see [Data persistence](#data-persistence).

### `docker-compose.test.yml` (test)

- PostgreSQL 18 on host port `5433` (avoids colliding with the dev DB).
- DB: `runway_test`.
- `tmpfs` mount — the DB is **intentionally ephemeral** (wiped on restart) so every test run starts from a clean slate. Persistence would be a bug here.
- Used by integration and e2e tests via `getTestDb()` (`DATABASE_URL=postgres://runway:runway@localhost:5433/runway_test`).

### `docker-compose.full.yml` (full stack)

Services and their startup order:

```
postgres (healthy)
  └── migrate (runs once, exits 0)
        ├── worker (long-running; polls apps table)
        └── api   (long-running; published on host port 3001)
              └── web (vite preview; published on host port 5173)
```

| Service | Image | Host port | Notes |
|---|---|---|---|
| `postgres` | `postgres:18` | `5434` | Bind-mounted to `./.data/postgres-full` (separate from the dev DB) |
| `migrate` | `backend.Dockerfile` | — | Runs `bun run --cwd packages/core migrate`; exits after completion |
| `worker` | `backend.Dockerfile` | — | `bun run --cwd apps/worker start`; polls `apps` table — no seeding |
| `api` | `backend.Dockerfile` | `3001` | `bun run --cwd apps/api start`; internal port `3000` |
| `web` | `frontend.Dockerfile` | `5173` | Vite preview (pre-built); proxies `/api` to `http://api:3000` |

**API proxy in the web container:** `frontend.Dockerfile` builds the Vite app (`vite build`), then starts `vite preview` which forwards `/api` requests to the `API_PROXY_TARGET` environment variable (`http://api:3000`). This mirrors the dev-time Vite proxy.

## Dockerfiles

### `docker/backend.Dockerfile`

Used for `migrate`, `worker`, and `api` services. Copies the full monorepo, runs `bun install --frozen-lockfile`. The service command is passed in the compose file, so this is a general-purpose monorepo image.

### `docker/frontend.Dockerfile`

Extends the same base pattern, additionally runs `vite build` at image-build time, then starts `vite preview` as the default command.

## Data persistence

The brief requires the app to **survive a stop/restart without losing data** (R3). That has two halves, and both are covered:

1. **Application correctness** — reviews are upserted by their stable RSS `id`, so re-ingestion after a restart converges with no duplicates and no cursor to persist. See [`docs/data-model.md`](data-model.md).
2. **Durable storage** — the dev and full-stack Postgres are **bind-mounted to gitignored directories in the repo root**, so the data files live on the host disk where you can see them:

   | Stack | Host path | Container path |
   |---|---|---|
   | dev (`docker-compose.yml`) | `./.data/postgres-dev` | `/var/lib/postgresql` |
   | full (`docker-compose.full.yml`) | `./.data/postgres-full` | `/var/lib/postgresql` |

   `.data/` is gitignored (only a `.gitkeep` is tracked). Because these are **bind mounts** rather than named Docker volumes, the data survives not just `docker compose restart` / `stop`+`start` / `down`+`up`, but even **`docker compose down -v`** (which removes named volumes — a bind-mounted host directory is untouched). PostgreSQL 18 stores its cluster under `/var/lib/postgresql/<ver>/`, so the mount target is the parent `/var/lib/postgresql` (not `…/data`).

   Verified end-to-end: ingest 500 reviews → `down` → `up` → still 500; → `down -v` → `up` → still 500.

The **test** Postgres is deliberately the opposite — a `tmpfs` mount — so each test run starts clean.

## Migrations

Migrations are managed by Drizzle Kit.

- **Schema source:** `packages/core/src/infrastructure/db/schema.ts`
- **Migration output:** `packages/core/src/infrastructure/db/migrations/`
- **Generate** (after schema changes): `bun run generate`
- **Apply** (against `DATABASE_URL`): `bun run migrate`

The migrate script (`packages/core/src/infrastructure/db/migrate.ts`) uses `drizzle-orm/bun-sql/migrator` and requires `DATABASE_URL` in the environment.

## Bun-native SQL driver

The DB client (`packages/core/src/infrastructure/db/client.ts`) uses `drizzle-orm/bun-sql` with Bun's built-in `SQL` class:

```ts
import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
export function createDb(url: string) {
  return drizzle({ client: new SQL(url), schema });
}
```

This eliminates the `pg`/`postgres` npm dependency entirely. The driver is only available in Bun; the codebase is not intended to run in Node.

See [`docs/decisions.md`](decisions.md) for the rationale and [`docs/testing.md`](testing.md) for how the test DB is wired.
