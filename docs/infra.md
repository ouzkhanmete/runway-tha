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
- Named volume `runway_pg` for persistence.

### `docker-compose.test.yml` (test)

- PostgreSQL 18 on host port `5433` (avoids colliding with the dev DB).
- DB: `runway_test`.
- `tmpfs` mount — the DB is ephemeral; wiped on container restart.
- Used by integration and e2e tests via `getTestDb()` (`DATABASE_URL=postgres://runway:runway@localhost:5433/runway_test`).

### `docker-compose.full.yml` (full stack)

Services and their startup order:

```
postgres (healthy)
  └── migrate (runs once, exits 0)
        ├── worker (long-running; seeds 595068606 on start)
        └── api   (long-running; published on host port 3001)
              └── web (vite preview; published on host port 5173)
```

| Service | Image | Host port | Notes |
|---|---|---|---|
| `postgres` | `postgres:18` | `5434` | Separate volume from dev DB |
| `migrate` | monorepo Dockerfile | — | Runs `bun run --cwd packages/core migrate`; exits after completion |
| `worker` | monorepo Dockerfile | — | `bun run --cwd apps/worker start`; seeds app `595068606` |
| `api` | monorepo Dockerfile | `3001` | `bun run --cwd apps/api start`; internal port `3000` |
| `web` | `web.Dockerfile` | `5173` | Vite preview (pre-built); proxies `/api` to `http://api:3000` |

**API proxy in the web container:** `web.Dockerfile` builds the Vite app (`vite build`), then starts `vite preview` which forwards `/api` requests to the `API_PROXY_TARGET` environment variable (`http://api:3000`). This mirrors the dev-time Vite proxy.

## Dockerfiles

### `docker/Dockerfile`

Used for `migrate`, `worker`, and `api` services. Copies the full monorepo, runs `bun install --frozen-lockfile`. The service command is passed in the compose file, so this is a general-purpose monorepo image.

### `docker/web.Dockerfile`

Extends the same base pattern, additionally runs `vite build` at image-build time, then starts `vite preview` as the default command.

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
