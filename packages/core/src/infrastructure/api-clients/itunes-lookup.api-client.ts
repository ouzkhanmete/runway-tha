import type { AppMetadataClient } from "@packages/core/application/api-clients/app-metadata.api-client";
import type { FetchLike } from "./apple-rss.api-client";

interface ItunesLookupApiClientDeps {
  fetch: FetchLike;
  baseUrl: string;
}

/**
 * Resolves an app's name from the iTunes Lookup API
 * (`/lookup?id={appId}&country={country}` → `results[0].trackName`). The
 * customer-reviews RSS feed used for reviews does not include the app name, so this
 * is the worker's source for it. Best-effort: any failure (network, non-2xx,
 * unexpected shape, no result) resolves to `null`, since the name is non-critical.
 */
export class ItunesLookupApiClient implements AppMetadataClient {
  constructor(private deps: ItunesLookupApiClientDeps) {}

  async fetchAppName(appId: string, country: string): Promise<string | null> {
    const url = `${this.deps.baseUrl}/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(country)}`;
    try {
      const res = await this.deps.fetch(url);
      if (!res.ok) return null;
      const json = (await res.json()) as { results?: Array<{ trackName?: unknown }> };
      const name = json.results?.[0]?.trackName;
      return typeof name === "string" && name.length > 0 ? name : null;
    } catch {
      return null;
    }
  }
}
