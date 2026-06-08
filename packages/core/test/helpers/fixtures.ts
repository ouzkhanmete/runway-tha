/**
 * Test fixtures for Apple's customer-reviews RSS JSON feed and domain reviews.
 *
 * Generic on purpose: the backend lane will extend these as the feed client /
 * mapper land. Field shape mirrors the real feed (`{ feed: { entry: [...] } }`),
 * where each entry carries `{ label }`-wrapped values.
 */

/** Shape of a single label-wrapped value in the RSS feed. */
type Labeled = { label: string };

/** Inputs for a single review entry (all optional; sensible defaults applied). */
export interface RssEntryInput {
  id?: string;
  author?: string;
  title?: string;
  content?: string;
  rating?: number;
  version?: string | null;
  updated?: string;
}

/** An RSS review entry as Apple serializes it (label-wrapped fields). */
export interface RssEntry {
  id: Labeled;
  author: { name: Labeled };
  title: Labeled;
  content: Labeled;
  "im:rating": Labeled;
  "im:version"?: Labeled;
  updated: Labeled;
}

let entrySeq = 0;

/** Build a single rating-bearing RSS entry. */
export function rssEntry(input: RssEntryInput = {}): RssEntry {
  const id = input.id ?? String(++entrySeq);
  const entry: RssEntry = {
    id: { label: id },
    author: { name: { label: input.author ?? "Test Author" } },
    title: { label: input.title ?? "Test Title" },
    content: { label: input.content ?? "Test content body." },
    "im:rating": { label: String(input.rating ?? 5) },
    updated: { label: input.updated ?? "2026-06-02T14:00:39-07:00" },
  };
  // `version` is nullable; omit the key entirely when null to mirror real feeds.
  if (input.version !== null) {
    entry["im:version"] = { label: input.version ?? "1.0" };
  }
  return entry;
}

/**
 * The leading "metadata" entry page 1 sometimes carries: it has NO `im:rating`
 * (only `id.label` + `im:name`) and must be skipped by the mapper.
 */
export function metadataEntry(appId = "595068606") {
  return {
    id: { label: appId },
    "im:name": { label: "Test App" },
  };
}

export interface RssPageInput {
  appId?: string;
  entries: RssEntryInput[];
  /** Prepend the rating-less metadata entry (page-1 reality). Default false. */
  includeMetadata?: boolean;
}

/** Build an RSS feed page: `{ feed: { entry: [...] } }`. */
export function rssPage({ appId = "595068606", entries, includeMetadata = false }: RssPageInput) {
  const built = entries.map((e) => rssEntry(e));
  const entry = includeMetadata ? [metadataEntry(appId), ...built] : built;
  return { feed: { entry } };
}

/** Domain-shaped review (matches the `reviews` table columns). */
export interface ReviewRow {
  id: string;
  appId: string;
  author: string;
  title: string;
  content: string;
  rating: number;
  version: string | null;
  submittedAt: Date;
}

let reviewSeq = 0;

/** Build a domain-shaped review with overrides. */
export function makeReview(overrides: Partial<ReviewRow> = {}): ReviewRow {
  const id = overrides.id ?? String(++reviewSeq);
  return {
    id,
    appId: overrides.appId ?? "595068606",
    author: overrides.author ?? "Test Author",
    title: overrides.title ?? "Test Title",
    content: overrides.content ?? "Test content body.",
    rating: overrides.rating ?? 5,
    version: overrides.version ?? "1.0",
    submittedAt: overrides.submittedAt ?? new Date("2026-06-02T21:00:39Z"),
  };
}
