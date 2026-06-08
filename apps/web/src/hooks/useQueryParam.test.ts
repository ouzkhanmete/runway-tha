import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { buildParamUrl, readParam, useQueryParam } from "./useQueryParam";

// The URL logic lives in pure helpers so it is fully testable without a DOM —
// happy-dom does not link history.pushState to window.location, so the hook's
// URL side effects can only be exercised in a real browser.

describe("readParam", () => {
  test("returns the value when present", () => {
    expect(readParam("?appId=123&w=48", "appId")).toBe("123");
  });
  test("returns undefined when absent", () => {
    expect(readParam("?w=48", "appId")).toBeUndefined();
  });
  test("returns undefined for an empty search", () => {
    expect(readParam("", "appId")).toBeUndefined();
  });
});

describe("buildParamUrl", () => {
  test("sets a new param, preserving others", () => {
    expect(buildParamUrl("?w=48", "/", "appId", "123")).toBe("/?w=48&appId=123");
  });
  test("replaces an existing value", () => {
    expect(buildParamUrl("?appId=1&w=48", "/", "appId", "2")).toBe("/?appId=2&w=48");
  });
  test("removes the param when value is undefined", () => {
    expect(buildParamUrl("?appId=1&w=48", "/", "appId", undefined)).toBe("/?w=48");
  });
  test("drops the query string entirely when nothing remains", () => {
    expect(buildParamUrl("?appId=1", "/", "appId", undefined)).toBe("/");
  });
});

describe("useQueryParam", () => {
  test("set() updates the returned value", () => {
    const { result } = renderHook(() => useQueryParam("appId"));
    act(() => result.current[1]("456"));
    expect(result.current[0]).toBe("456");
  });
});
