import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AppRegistryService, createRepositories, ReviewQueryService } from "@packages/core/index";
import { AppDtoSchema, makeReviewsQuerySchema } from "@packages/shared/index";
import {
  ensureMigrated,
  getTestDb,
  truncateAll,
} from "../../../../packages/core/test/helpers/test-db";
import { createApp } from "../../src/app";

const db = getTestDb();
const repos = createRepositories(db);
const reviewQuery = new ReviewQueryService({ reviews: repos.reviews });
const registry = new AppRegistryService({ apps: repos.apps });
const reviewsQuerySchema = makeReviewsQuerySchema(48);
const app = createApp({ reviewQuery, registry, reviewsQuerySchema });

beforeAll(ensureMigrated);
beforeEach(() => truncateAll(db));

describe("POST /apps", () => {
  test("201 with valid AppDto on new registration", async () => {
    const res = await app.request("/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "595068606" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(() => AppDtoSchema.parse(body)).not.toThrow();
    expect(body.id).toBe("595068606");
  });

  test("duplicate POST is idempotent — still 201, one row", async () => {
    // Register twice
    const res1 = await app.request("/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "595068606" }),
    });
    expect(res1.status).toBe(201);

    const res2 = await app.request("/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "595068606" }),
    });
    expect(res2.status).toBe(201);

    // Only one row in the DB
    const list = await repos.apps.list();
    expect(list.filter((a) => a.id === "595068606")).toHaveLength(1);
  });

  test("400 when appId is non-numeric", async () => {
    const res = await app.request("/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "abc" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });

  test("400 when body is empty/invalid JSON", async () => {
    const res = await app.request("/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
  });
});

describe("GET /apps", () => {
  test("returns empty array initially", async () => {
    const res = await app.request("/apps");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  test("includes registered app", async () => {
    await app.request("/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: "595068606" }),
    });

    const res = await app.request("/apps");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("595068606");
    expect(() => AppDtoSchema.parse(body[0])).not.toThrow();
  });
});
