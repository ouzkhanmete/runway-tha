import type { Rating } from "@packages/core/domain/rating";
import type { Review } from "@packages/core/domain/review";
import { isValid, parseISO } from "date-fns";
import type { FeedEntry, FeedJson } from "./apple-rss.types";

/**
 * Map a single raw feed entry to a Review domain object.
 * Returns null if the entry is a metadata entry (no `im:rating`), has an
 * invalid rating, or is missing the required `id`/`updated` fields.
 */
export function mapEntry(appId: string, e: FeedEntry): Review | null {
  const ratingRaw = e?.["im:rating"]?.label;
  if (ratingRaw == null) return null; // skip metadata entry

  const rating = parseInt(ratingRaw, 10);
  if (Number.isNaN(rating)) return null;

  // Defensively skip malformed entries missing required fields.
  const id = e.id?.label;
  const updatedRaw = e.updated?.label;
  if (!id || !updatedRaw) return null;
  const submittedAt = parseISO(updatedRaw);
  if (!isValid(submittedAt)) return null;

  return {
    id: String(id),
    appId,
    author: e.author?.name?.label ?? "",
    title: e.title?.label ?? "",
    content: e.content?.label ?? "",
    rating: rating as Rating,
    version: e["im:version"]?.label ?? null,
    submittedAt,
  };
}

/**
 * Map an entire feed page JSON to an array of Review domain objects.
 * Handles the case where `entry` is absent, an array, or a single object
 * (Apple returns a single object instead of an array when only one review exists).
 */
export function mapFeedPage(appId: string, json: FeedJson): Review[] {
  const raw = json?.feed?.entry;
  const entries: FeedEntry[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return entries.map((e) => mapEntry(appId, e)).filter((r): r is Review => r !== null);
}
