import { describe, test, expect } from "bun:test";
import { mapEntry, mapFeedPage } from "../../src/infrastructure/feed/review-mapper";
import { rssEntry, metadataEntry, rssPage } from "../helpers/fixtures";

describe("mapEntry", () => {
  test("maps a valid entry to a Review", () => {
    const entry = rssEntry({ id: "42", author: "Alice", title: "Great!", content: "Love it", rating: 5, version: "2.1", updated: "2026-06-01T10:00:00Z" });
    const review = mapEntry("595068606", entry);
    expect(review).not.toBeNull();
    expect(review!.id).toBe("42");
    expect(review!.appId).toBe("595068606");
    expect(review!.author).toBe("Alice");
    expect(review!.title).toBe("Great!");
    expect(review!.content).toBe("Love it");
    expect(review!.rating).toBe(5);
    expect(Number.isInteger(review!.rating)).toBe(true);
    expect(review!.version).toBe("2.1");
    expect(review!.submittedAt).toBeInstanceOf(Date);
    expect(review!.submittedAt.toISOString()).toBe("2026-06-01T10:00:00.000Z");
  });

  test("returns null for a metadataEntry (no im:rating)", () => {
    const meta = metadataEntry("595068606");
    const result = mapEntry("595068606", meta);
    expect(result).toBeNull();
  });

  test("tolerates missing im:version -> version: null", () => {
    const entry = rssEntry({ version: null });
    const review = mapEntry("595068606", entry);
    expect(review).not.toBeNull();
    expect(review!.version).toBeNull();
  });

  test("returns null for entry with non-numeric rating", () => {
    const entry = { ...rssEntry(), "im:rating": { label: "not-a-number" } };
    const result = mapEntry("595068606", entry);
    expect(result).toBeNull();
  });
});

describe("mapFeedPage", () => {
  test("maps all non-null reviews from a page", () => {
    const json = rssPage({ appId: "595068606", entries: [{ id: "1" }, { id: "2" }] });
    const reviews = mapFeedPage("595068606", json);
    expect(reviews).toHaveLength(2);
    expect(reviews[0].id).toBe("1");
    expect(reviews[1].id).toBe("2");
  });

  test("returns [] for empty entry array", () => {
    const json = rssPage({ appId: "595068606", entries: [] });
    const reviews = mapFeedPage("595068606", json);
    expect(reviews).toHaveLength(0);
  });

  test("returns [] for absent feed.entry", () => {
    const json = { feed: {} };
    const reviews = mapFeedPage("595068606", json);
    expect(reviews).toHaveLength(0);
  });

  test("handles a single-object (non-array) entry", () => {
    // When there's only one review, Apple sometimes returns an object, not an array
    const single = rssEntry({ id: "99" });
    const json = { feed: { entry: single } };
    const reviews = mapFeedPage("595068606", json);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe("99");
  });

  test("skips metadata entry when includeMetadata: true", () => {
    const json = rssPage({ appId: "595068606", entries: [{ id: "10", rating: 4 }], includeMetadata: true });
    const reviews = mapFeedPage("595068606", json);
    // metadata entry has no im:rating, should be filtered
    expect(reviews).toHaveLength(1);
    expect(reviews[0].id).toBe("10");
  });
});
