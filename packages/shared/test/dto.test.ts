import { test, expect } from "bun:test";
import { ReviewDtoSchema, RegisterAppRequestSchema, ReviewsQuerySchema, AppDtoSchema } from "../src";

test("ReviewDtoSchema parses a valid review", () => {
  const dto = ReviewDtoSchema.parse({
    id: "1", appId: "595068606", author: "A", title: "T",
    content: "C", rating: 5, version: "1.0", submittedAt: "2026-06-02T14:00:39-07:00",
  });
  expect(dto.rating).toBe(5);
  expect(dto.version).toBe("1.0");
});
test("ReviewDtoSchema allows null version", () => {
  const dto = ReviewDtoSchema.parse({ id:"1", appId:"1", author:"A", title:"T", content:"C", rating:3, version:null, submittedAt:"x" });
  expect(dto.version).toBeNull();
});
test("RegisterAppRequestSchema rejects non-numeric appId", () => {
  expect(() => RegisterAppRequestSchema.parse({ appId: "abc" })).toThrow();
});
test("RegisterAppRequestSchema accepts numeric appId and optional country", () => {
  expect(RegisterAppRequestSchema.parse({ appId: "595068606" }).appId).toBe("595068606");
});
test("ReviewsQuerySchema defaults windowHours to 48", () => {
  expect(ReviewsQuerySchema.parse({}).windowHours).toBe(48);
});
test("ReviewsQuerySchema coerces string and clamps to allowed set", () => {
  expect(ReviewsQuerySchema.parse({ windowHours: "168" }).windowHours).toBe(168);
  expect(() => ReviewsQuerySchema.parse({ windowHours: 999 })).toThrow();
});
test("AppDtoSchema parses", () => {
  expect(AppDtoSchema.parse({ id:"1", name:null, country:"us", createdAt:"x" }).country).toBe("us");
});
