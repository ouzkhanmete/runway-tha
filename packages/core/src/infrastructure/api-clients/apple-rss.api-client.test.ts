import { describe, expect, test } from "bun:test";
import { rssPage } from "../../../test/helpers/fixtures";
import { AppleRssApiClient, type FetchLike } from "./apple-rss.api-client";

const BASE_URL = "https://itunes.apple.com";
const APP_ID = "595068606";
const COUNTRY = "us";

/** Build a fake fetch that returns pages in sequence. */
function makeFetch(pages: Array<{ status: number; body?: object }>): FetchLike {
  let call = 0;
  return async (): Promise<Response> => {
    const idx = call++;
    const page = pages[idx] ?? { status: 200, body: rssPage({ entries: [] }) };
    return new Response(JSON.stringify(page.body ?? {}), { status: page.status });
  };
}

const noSleep = async (_ms: number) => {};

describe("AppleRssApiClient", () => {
  test("builds the correct URL per page", async () => {
    const urls: string[] = [];
    // Use non-empty pages so both get fetched (no early-stop)
    const p1 = rssPage({ entries: [{ id: "1" }] });
    const p2 = rssPage({ entries: [{ id: "2" }] });
    let call = 0;
    const fakeFetch: FetchLike = async (url): Promise<Response> => {
      urls.push(String(url));
      const body = call++ === 0 ? p1 : p2;
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const client = new AppleRssApiClient({
      fetch: fakeFetch,
      baseUrl: BASE_URL,
      maxPages: 2,
      maxRetries: 1,
      sleep: noSleep,
    });
    await client.fetchAllPages(APP_ID, COUNTRY);
    expect(urls[0]).toBe(
      `${BASE_URL}/${COUNTRY}/rss/customerreviews/id=${APP_ID}/sortBy=mostRecent/page=1/json`,
    );
    expect(urls[1]).toBe(
      `${BASE_URL}/${COUNTRY}/rss/customerreviews/id=${APP_ID}/sortBy=mostRecent/page=2/json`,
    );
  });

  test("aggregates pages 1..maxPages and returns correct pagesFetched", async () => {
    const p1 = rssPage({
      entries: [
        { id: "1", rating: 5 },
        { id: "2", rating: 4 },
      ],
    });
    const p2 = rssPage({ entries: [{ id: "3", rating: 3 }] });
    const fakeFetch = makeFetch([
      { status: 200, body: p1 },
      { status: 200, body: p2 },
    ]);
    const client = new AppleRssApiClient({
      fetch: fakeFetch,
      baseUrl: BASE_URL,
      maxPages: 2,
      maxRetries: 1,
      sleep: noSleep,
    });
    const result = await client.fetchAllPages(APP_ID, COUNTRY);
    expect(result.pagesFetched).toBe(2);
    expect(result.reviews).toHaveLength(3);
    expect(result.reviews.map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  test("stops early when a page returns 0 entries", async () => {
    const p1 = rssPage({ entries: [{ id: "1" }] });
    const emptyPage = rssPage({ entries: [] });
    let fetchCount = 0;
    const fakeFetch: FetchLike = async (): Promise<Response> => {
      fetchCount++;
      const body = fetchCount === 1 ? p1 : emptyPage;
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const client = new AppleRssApiClient({
      fetch: fakeFetch,
      baseUrl: BASE_URL,
      maxPages: 5,
      maxRetries: 1,
      sleep: noSleep,
    });
    const result = await client.fetchAllPages(APP_ID, COUNTRY);
    // Page 1 has 1 review, page 2 is empty → stop; pagesFetched = 2 (we fetched the empty page)
    expect(result.pagesFetched).toBe(2);
    expect(result.reviews).toHaveLength(1);
  });

  test("retries on 429 with backoff then succeeds", async () => {
    const goodPage = rssPage({ entries: [{ id: "10", rating: 4 }] });
    const calls: string[] = [];
    const fakeFetch: FetchLike = async (): Promise<Response> => {
      calls.push("call");
      if (calls.length < 3) {
        return new Response("Too Many Requests", { status: 429 });
      }
      return new Response(JSON.stringify(goodPage), { status: 200 });
    };
    const sleepCalls: number[] = [];
    const fakeSleep = async (ms: number) => {
      sleepCalls.push(ms);
    };
    const client = new AppleRssApiClient({
      fetch: fakeFetch,
      baseUrl: BASE_URL,
      maxPages: 1,
      maxRetries: 3,
      sleep: fakeSleep,
    });
    const result = await client.fetchAllPages(APP_ID, COUNTRY);
    expect(result.reviews).toHaveLength(1);
    expect(calls).toHaveLength(3); // 2 failures + 1 success
    expect(sleepCalls).toHaveLength(2); // slept before each retry
  });

  test("retries on 403 then succeeds", async () => {
    const goodPage = rssPage({ entries: [{ id: "20", rating: 5 }] });
    let callCount = 0;
    const fakeFetch: FetchLike = async (): Promise<Response> => {
      callCount++;
      if (callCount === 1) return new Response("Forbidden", { status: 403 });
      return new Response(JSON.stringify(goodPage), { status: 200 });
    };
    const client = new AppleRssApiClient({
      fetch: fakeFetch,
      baseUrl: BASE_URL,
      maxPages: 1,
      maxRetries: 2,
      sleep: noSleep,
    });
    const result = await client.fetchAllPages(APP_ID, COUNTRY);
    expect(result.reviews).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  test("retries on 5xx then succeeds", async () => {
    const goodPage = rssPage({ entries: [{ id: "30", rating: 3 }] });
    let callCount = 0;
    const fakeFetch: FetchLike = async (): Promise<Response> => {
      callCount++;
      if (callCount < 3) return new Response("Server Error", { status: 500 });
      return new Response(JSON.stringify(goodPage), { status: 200 });
    };
    const client = new AppleRssApiClient({
      fetch: fakeFetch,
      baseUrl: BASE_URL,
      maxPages: 1,
      maxRetries: 3,
      sleep: noSleep,
    });
    const result = await client.fetchAllPages(APP_ID, COUNTRY);
    expect(result.reviews).toHaveLength(1);
    expect(callCount).toBe(3);
  });

  test("throws after maxRetries on persistent 5xx", async () => {
    const fakeFetch: FetchLike = async (): Promise<Response> => {
      return new Response("Internal Server Error", { status: 500 });
    };
    const client = new AppleRssApiClient({
      fetch: fakeFetch,
      baseUrl: BASE_URL,
      maxPages: 3,
      maxRetries: 2,
      sleep: noSleep,
    });
    await expect(client.fetchAllPages(APP_ID, COUNTRY)).rejects.toThrow();
  });
});
