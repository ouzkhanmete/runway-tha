import { loadEnv } from "../config/env";
import { createDb } from "../infrastructure/db/client";
import { createRepositories } from "../infrastructure/repositories/repository.factory";

/** Path (relative to FEED_BASE_URL) of the US "top free apps" RSS feed. */
const TOP_APPS_PATH = "/us/rss/topfreeapplications/limit=10/json";

/**
 * Pure: extract the numeric App Store ids from a top-apps RSS payload
 * (`feed.entry[].id.attributes["im:id"]`). Defensive — returns `[]` for anything
 * malformed and ignores non-numeric ids.
 */
export function parseTopAppIds(json: unknown): string[] {
  const entries = (json as { feed?: { entry?: unknown } })?.feed?.entry;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => (e as { id?: { attributes?: { "im:id"?: unknown } } })?.id?.attributes?.["im:id"])
    .filter((id): id is string => typeof id === "string" && /^\d+$/.test(id));
}

/**
 * Seeds the `apps` table with the current US top-free apps so the worker has work
 * to do on first boot and the UI is pre-populated. Inserts **ids only** — the worker
 * fills each app's name from the lookup API when it first ingests it. Idempotent:
 * apps already present are skipped (create uses `ON CONFLICT DO NOTHING`).
 *
 * Never throws on a feed failure — it exits 0 so it can't block stack startup (the
 * reviewer can still add apps manually); seeding is a convenience, not a requirement.
 */
async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const repos = createRepositories(db);

  let ids: string[] = [];
  try {
    const res = await fetch(`${env.FEED_BASE_URL}${TOP_APPS_PATH}`);
    if (!res.ok) throw new Error(`top-apps feed returned HTTP ${res.status}`);
    ids = parseTopAppIds(await res.json());
  } catch (err) {
    console.warn(`[seed] could not fetch top apps (${String(err)}); skipping — add apps manually`);
    process.exit(0);
  }

  let inserted = 0;
  for (const id of ids) {
    if (await repos.apps.findById(id)) continue; // already tracked — skip
    await repos.apps.create({ id });
    inserted++;
  }

  console.log(`[seed] top apps: ${inserted} inserted, ${ids.length - inserted} already present`);
  process.exit(0);
}

// Only run when executed directly (so tests can import `parseTopAppIds` without side effects).
if (import.meta.main) {
  await main();
}
