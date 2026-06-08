import type {
  AppLookup,
  AppMetadataClient,
} from "@packages/core/application/api-clients/app-metadata.api-client";
import type { FetchLike } from "./apple-rss.api-client";

interface ItunesLookupApiClientDeps {
  fetch: FetchLike;
  baseUrl: string;
}

/**
 * Looks up an app via the iTunes Lookup API
 * (`/lookup?id={appId}&country={country}` → `results[0].trackName`). Used at
 * registration time to validate the app exists and resolve its display name (the
 * reviews feed carries neither). A successful HTTP response with no results means
 * the app doesn't exist (`{ found: false }`); any transient failure (network or
 * non-2xx) throws so callers can tell "absent" apart from "couldn't check".
 */
export class ItunesLookupApiClient implements AppMetadataClient {
  constructor(private deps: ItunesLookupApiClientDeps) {}

  async lookup(appId: string, country: string): Promise<AppLookup> {
    const url = `${this.deps.baseUrl}/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(country)}`;
    const res = await this.deps.fetch(url);
    if (!res.ok) throw new Error("iTunes lookup HTTP " + res.status + " for " + appId);
    const json = (await res.json()) as { results?: Array<{ trackName?: unknown }> };
    const result = json.results?.[0];
    if (!result) return { found: false };
    const name = result.trackName;
    return { found: true, name: typeof name === "string" && name.length > 0 ? name : null };
  }
}
