import { describe, expect, test } from "bun:test";
import type { AppDto, ReviewDto } from "@packages/shared/index";
import { createApiClient } from "./client";

const sampleReview: ReviewDto = {
  id: "r1",
  appId: "app1",
  author: "Jane Doe",
  title: "Great app",
  content: "Really love it",
  rating: 5,
  version: "2.0",
  submittedAt: "2026-06-01T12:00:00Z",
};

const sampleApp: AppDto = {
  id: "app1",
  name: "My App",
  country: "us",
  createdAt: "2026-01-01T00:00:00Z",
  claimedAt: null,
};

function makeFetch(status: number, body: unknown): typeof fetch {
  const fn = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  };
  return fn as typeof fetch;
}

describe("createApiClient - getReviews", () => {
  test("parses a valid reviews page response", async () => {
    const client = createApiClient({
      fetch: makeFetch(200, { items: [sampleReview], nextCursor: "abc123" }),
    });
    const page = await client.getReviews("app1", 48);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].author).toBe("Jane Doe");
    expect(page.items[0].rating).toBe(5);
    expect(page.nextCursor).toBe("abc123");
  });

  test("forwards the cursor as a query param", async () => {
    let calledUrl = "";
    const fetchSpy = (async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], nextCursor: null }),
      } as Response;
    }) as typeof fetch;
    const client = createApiClient({ fetch: fetchSpy });
    await client.getReviews("app1", 48, "CURSOR_TOKEN");
    expect(calledUrl).toContain("cursor=CURSOR_TOKEN");
    expect(calledUrl).toContain("windowHours=48");
  });

  test("throws on malformed payload (not a page shape)", async () => {
    const malformed = [{ id: "r1", appId: "app1" }]; // an array, not { items, nextCursor }
    const client = createApiClient({ fetch: makeFetch(200, malformed) });
    await expect(client.getReviews("app1", 48)).rejects.toThrow();
  });

  test("throws with ApiError message on non-2xx response", async () => {
    const apiErrorBody = {
      error: { code: "NOT_FOUND", message: "App not found" },
    };
    const client = createApiClient({ fetch: makeFetch(404, apiErrorBody) });
    await expect(client.getReviews("app1", 48)).rejects.toThrow("App not found");
  });

  test("throws generic message on non-2xx with unrecognized body", async () => {
    const client = createApiClient({ fetch: makeFetch(500, { unexpected: true }) });
    await expect(client.getReviews("app1", 48)).rejects.toThrow("Request failed (500)");
  });
});

describe("createApiClient - getApps", () => {
  test("parses valid AppDto[] response", async () => {
    const client = createApiClient({ fetch: makeFetch(200, [sampleApp]) });
    const apps = await client.getApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe("app1");
    expect(apps[0].country).toBe("us");
  });

  test("throws on malformed AppDto payload", async () => {
    const client = createApiClient({ fetch: makeFetch(200, [{ id: "x" }]) });
    await expect(client.getApps()).rejects.toThrow();
  });
});

describe("createApiClient - registerApp", () => {
  test("parses valid AppDto response", async () => {
    const client = createApiClient({ fetch: makeFetch(200, sampleApp) });
    const app = await client.registerApp("12345", "us");
    expect(app.id).toBe("app1");
    expect(app.name).toBe("My App");
  });

  test("throws ApiError message on non-2xx", async () => {
    const apiErrorBody = {
      error: { code: "CONFLICT", message: "App already registered" },
    };
    const client = createApiClient({ fetch: makeFetch(409, apiErrorBody) });
    await expect(client.registerApp("12345")).rejects.toThrow("App already registered");
  });
});
