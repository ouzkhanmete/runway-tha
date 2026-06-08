/** Shape of a single label-wrapped value in the RSS JSON feed. */
export interface Labeled {
  label: string;
}

/** A single review entry as Apple serializes it in the RSS JSON feed. */
export interface FeedEntry {
  id: Labeled;
  author?: { name?: Labeled };
  title?: Labeled;
  content?: Labeled;
  "im:rating"?: Labeled;
  "im:version"?: Labeled;
  updated?: Labeled;
  [key: string]: unknown;
}

/** Top-level RSS JSON structure returned by the iTunes API. */
export interface FeedJson {
  feed?: {
    entry?: FeedEntry | FeedEntry[];
    [key: string]: unknown;
  };
}
