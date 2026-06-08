import { describe, expect, test } from "bun:test";
import { ItunesLookupApiClient } from "./itunes-lookup.api-client";

function res(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("ItunesLookupApiClient", () => {
  test("builds the lookup URL with id + country and returns trackName", async () => {
    let calledUrl = "";
    const client = new ItunesLookupApiClient({
      baseUrl: "https://itunes.apple.com",
      fetch: async (url) => {
        calledUrl = url;
        return res(200, { resultCount: 1, results: [{ trackName: "Tab - bill splitter" }] });
      },
    });

    const name = await client.fetchAppName("595068606", "us");
    expect(calledUrl).toBe("https://itunes.apple.com/lookup?id=595068606&country=us");
    expect(name).toBe("Tab - bill splitter");
  });

  test("returns null when there are no results", async () => {
    const client = new ItunesLookupApiClient({
      baseUrl: "x",
      fetch: async () => res(200, { resultCount: 0, results: [] }),
    });
    expect(await client.fetchAppName("1", "us")).toBeNull();
  });

  test("returns null when trackName is missing or empty", async () => {
    const client = new ItunesLookupApiClient({
      baseUrl: "x",
      fetch: async () => res(200, { results: [{ trackName: "" }] }),
    });
    expect(await client.fetchAppName("1", "us")).toBeNull();
  });

  test("returns null on a non-2xx response", async () => {
    const client = new ItunesLookupApiClient({ baseUrl: "x", fetch: async () => res(503, {}) });
    expect(await client.fetchAppName("1", "us")).toBeNull();
  });

  test("returns null when fetch throws (best-effort)", async () => {
    const client = new ItunesLookupApiClient({
      baseUrl: "x",
      fetch: async () => {
        throw new Error("network down");
      },
    });
    expect(await client.fetchAppName("1", "us")).toBeNull();
  });
});
