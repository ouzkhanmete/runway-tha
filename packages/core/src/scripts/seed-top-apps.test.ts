import { describe, expect, test } from "bun:test";
import { parseTopAppIds } from "./seed-top-apps";

describe("parseTopAppIds", () => {
  test("extracts numeric ids from a top-apps feed payload", () => {
    const json = {
      feed: {
        entry: [
          { id: { attributes: { "im:id": "6448311069" } }, "im:name": { label: "ChatGPT" } },
          { id: { attributes: { "im:id": "310633997" } }, "im:name": { label: "WhatsApp" } },
        ],
      },
    };
    expect(parseTopAppIds(json)).toEqual(["6448311069", "310633997"]);
  });

  test("returns [] for malformed / empty payloads", () => {
    expect(parseTopAppIds(null)).toEqual([]);
    expect(parseTopAppIds({})).toEqual([]);
    expect(parseTopAppIds({ feed: {} })).toEqual([]);
    expect(parseTopAppIds({ feed: { entry: "nope" } })).toEqual([]);
  });

  test("ignores entries with missing or non-numeric ids", () => {
    const json = {
      feed: {
        entry: [
          { id: { attributes: { "im:id": "abc" } } },
          { id: { attributes: {} } },
          {},
          { id: { attributes: { "im:id": "123" } } },
        ],
      },
    };
    expect(parseTopAppIds(json)).toEqual(["123"]);
  });
});
