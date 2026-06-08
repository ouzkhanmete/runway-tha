import { expect, test } from "bun:test";
import { Country } from "../enums/country";
import {
  AppDtoSchema,
  makeReviewsQuerySchema,
  RegisterAppRequestSchema,
  ReviewDtoSchema,
  ReviewsQuerySchema,
} from "../index";

test("ReviewDtoSchema parses a valid review", () => {
  const dto = ReviewDtoSchema.parse({
    id: "1",
    appId: "595068606",
    author: "A",
    title: "T",
    content: "C",
    rating: 5,
    version: "1.0",
    submittedAt: "2026-06-02T14:00:39-07:00",
  });
  expect(dto.rating).toBe(5);
  expect(dto.version).toBe("1.0");
});

test("ReviewDtoSchema allows null version", () => {
  const dto = ReviewDtoSchema.parse({
    id: "1",
    appId: "1",
    author: "A",
    title: "T",
    content: "C",
    rating: 3,
    version: null,
    submittedAt: "x",
  });
  expect(dto.version).toBeNull();
});

test("RegisterAppRequestSchema rejects non-numeric appId", () => {
  expect(() => RegisterAppRequestSchema.parse({ appId: "abc" })).toThrow();
});

test("RegisterAppRequestSchema accepts numeric appId and the Country enum", () => {
  expect(RegisterAppRequestSchema.parse({ appId: "595068606" }).appId).toBe("595068606");
  expect(RegisterAppRequestSchema.parse({ appId: "1", country: Country.US }).country).toBe(
    Country.US,
  );
});

test("ReviewsQuerySchema defaults windowHours to 48", () => {
  expect(ReviewsQuerySchema.parse({}).windowHours).toBe(48);
});

test("ReviewsQuerySchema accepts any integer in [1, 8760]", () => {
  expect(ReviewsQuerySchema.parse({ windowHours: "72" }).windowHours).toBe(72);
  expect(ReviewsQuerySchema.parse({ windowHours: 1 }).windowHours).toBe(1);
  expect(ReviewsQuerySchema.parse({ windowHours: 720 }).windowHours).toBe(720);
  expect(ReviewsQuerySchema.parse({ windowHours: 8760 }).windowHours).toBe(8760);
});

test("ReviewsQuerySchema rejects out-of-range windowHours", () => {
  expect(() => ReviewsQuerySchema.parse({ windowHours: 0 })).toThrow();
  expect(() => ReviewsQuerySchema.parse({ windowHours: 8761 })).toThrow();
});

test("makeReviewsQuerySchema honors a custom default", () => {
  expect(makeReviewsQuerySchema(168).parse({}).windowHours).toBe(168);
});

test("AppDtoSchema parses", () => {
  const dto = AppDtoSchema.parse({
    id: "1",
    name: null,
    country: "us",
    createdAt: "x",
    claimedAt: null,
  });
  expect(dto.country).toBe("us");
  expect(dto.claimedAt).toBeNull();
});

test("AppDtoSchema carries claimedAt when an app is being synced", () => {
  const dto = AppDtoSchema.parse({
    id: "1",
    name: null,
    country: "us",
    createdAt: "x",
    claimedAt: "2026-06-08T12:00:00Z",
  });
  expect(dto.claimedAt).toBe("2026-06-08T12:00:00Z");
});
