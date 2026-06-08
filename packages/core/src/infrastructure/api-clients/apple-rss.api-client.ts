import type { ReviewFeedClient } from "@packages/core/application/api-clients/review-feed.api-client";
import type { Review } from "@packages/core/domain/review";
import { mapFeedPage } from "./apple-rss.mapper";
import type { FeedJson } from "./apple-rss.types";

/**
 * Narrowed fetch dependency: only the call shape we use. The full `typeof fetch`
 * additionally requires a `preconnect` property that test doubles lack.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

interface AppleRssApiClientDeps {
  fetch: FetchLike;
  baseUrl: string;
  maxPages: number;
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Statuses that warrant a retry with backoff. */
const RETRYABLE_STATUSES = new Set([403, 429]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

export class AppleRssApiClient implements ReviewFeedClient {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private deps: AppleRssApiClientDeps) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async fetchAllPages(
    appId: string,
    country: string,
  ): Promise<{ reviews: Review[]; pagesFetched: number }> {
    const allReviews: Review[] = [];
    let pagesFetched = 0;

    for (let page = 1; page <= this.deps.maxPages; page++) {
      const url = `${this.deps.baseUrl}/${country}/rss/customerreviews/id=${appId}/sortBy=mostRecent/page=${page}/json`;
      const json = await this.fetchPageWithRetry(url);
      pagesFetched++;

      const reviews = mapFeedPage(appId, json as FeedJson);
      allReviews.push(...reviews);

      if (reviews.length === 0) {
        break;
      }
    }

    return { reviews: allReviews, pagesFetched };
  }

  private async fetchPageWithRetry(url: string): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.deps.maxRetries; attempt++) {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt - 1) * 50;
        await this.sleep(backoffMs);
      }

      const res = await this.deps.fetch(url);

      if (res.ok) {
        return res.json();
      }

      if (isRetryable(res.status)) {
        lastError = new Error(`HTTP ${res.status} from ${url}`);
        if (attempt < this.deps.maxRetries) {
          continue;
        }
        // exhausted retries
        throw lastError;
      }

      // Non-retryable error (e.g. 404)
      throw new Error(`HTTP ${res.status} from ${url}`);
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }
}
