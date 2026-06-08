import type { Review } from "../../domain/review";
import type { Rating } from "../../domain/rating";

/**
 * Map a single raw feed entry to a Review domain object.
 * Returns null if the entry is a metadata entry (no `im:rating`) or has an
 * invalid rating.
 */
export function mapEntry(appId: string, e: any): Review | null {
  const ratingRaw = e?.["im:rating"]?.label;
  if (ratingRaw == null) return null; // skip metadata entry

  const rating = parseInt(ratingRaw, 10);
  if (Number.isNaN(rating)) return null;

  return {
    id: String(e.id.label),
    appId,
    author: e.author?.name?.label ?? "",
    title: e.title?.label ?? "",
    content: e.content?.label ?? "",
    rating: rating as Rating,
    version: e["im:version"]?.label ?? null,
    submittedAt: new Date(e.updated.label),
  };
}

/**
 * Map an entire feed page JSON to an array of Review domain objects.
 * Handles the case where `entry` is absent, an array, or a single object
 * (Apple returns a single object instead of an array when only one review exists).
 */
export function mapFeedPage(appId: string, json: any): Review[] {
  const raw = json?.feed?.entry;
  const entries: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return entries
    .map((e) => mapEntry(appId, e))
    .filter((r): r is Review => r !== null);
}
