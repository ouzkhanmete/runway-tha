import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import {
  DrizzleAppRepository,
  DrizzleReviewRepository,
  ReviewQueryService,
  AppRegistryService,
} from "@runway/core";
import { AppDtoSchema } from "@runway/shared";
import {
  getTestDb,
  ensureMigrated,
  truncateAll,
} from "../../node_modules/@runway/core/test/helpers/test-db";
import { createApp } from "../../src/app";

const db = getTestDb();
const appRepo = new DrizzleAppRepository(db);
const reviewRepo = new DrizzleReviewRepository(db);
const reviewQuery = new ReviewQueryService({ reviews: reviewRepo });
const registry = new AppRegistryService({ apps: appRepo });
const app = createApp({ reviewQuery, registry });

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
    const list = await appRepo.list();
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
