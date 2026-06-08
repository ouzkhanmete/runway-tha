import { describe, expect, test } from "bun:test";
import { ItunesLookupApiClient } from "./itunes-lookup.api-client";

function res(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("ItunesLookupApiClient", () => {
  test("builds the lookup URL with id + country and returns found:true with trackName", async () => {
    let calledUrl = "";
    const client = new ItunesLookupApiClient({
      baseUrl: "https://itunes.apple.com",
      fetch: async (url) => {
        calledUrl = url;
        return res(200, { resultCount: 1, results: [{ trackName: "Tab - bill splitter" }] });
      },
    });

    const result = await client.lookup("595068606", "us");
    expect(calledUrl).toBe("https://itunes.apple.com/lookup?id=595068606&country=us");
    expect(result).toEqual({ found: true, name: "Tab - bill splitter" });
  });

  test("returns found:false when resultCount is 0 / results is empty", async () => {
    const client = new ItunesLookupApiClient({
      baseUrl: "x",
      fetch: async () => res(200, { resultCount: 0, results: [] }),
    });
    expect(await client.lookup("1", "us")).toEqual({ found: false });
  });

  test("returns found:false when results is missing", async () => {
    const client = new ItunesLookupApiClient({
      baseUrl: "x",
      fetch: async () => res(200, { resultCount: 0 }),
    });
    expect(await client.lookup("1", "us")).toEqual({ found: false });
  });

  test("returns found:true with name:null when trackName is missing or empty", async () => {
    const client = new ItunesLookupApiClient({
      baseUrl: "x",
      fetch: async () => res(200, { results: [{ trackName: "" }] }),
    });
    expect(await client.lookup("1", "us")).toEqual({ found: true, name: null });
  });

  test("throws on a non-2xx response", async () => {
    const client = new ItunesLookupApiClient({ baseUrl: "x", fetch: async () => res(503, {}) });
    await expect(client.lookup("1", "us")).rejects.toThrow("iTunes lookup HTTP 503 for 1");
  });

  test("propagates when fetch throws (network error)", async () => {
    const client = new ItunesLookupApiClient({
      baseUrl: "x",
      fetch: async () => {
        throw new Error("network down");
      },
    });
    await expect(client.lookup("1", "us")).rejects.toThrow("network down");
  });
});
