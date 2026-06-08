import { z } from "zod";

/** Review window bounds in hours. Default 48h; max 8760h (1 year) of accumulated history. */
export const MIN_WINDOW_HOURS = 1;
export const MAX_WINDOW_HOURS = 8760; // 365 days
export const DEFAULT_WINDOW_HOURS = 48;

/** Cursor-pagination page size. Default 5 per page; capped so a single request stays cheap. */
export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 50;

/**
 * Build the reviews query schema. `windowHours` is an integer in [1, 8760]
 * (defaults to `defaultHours`); `limit` is the page size in [1, 50] (default 5);
 * `cursor` is the opaque keyset token from a previous page's `nextCursor`.
 * The API composition root builds this from `REVIEW_WINDOW_HOURS_DEFAULT`.
 */
export function makeReviewsQuerySchema(defaultHours: number = DEFAULT_WINDOW_HOURS) {
  return z.object({
    windowHours: z.coerce
      .number()
      .int()
      .min(MIN_WINDOW_HOURS)
      .max(MAX_WINDOW_HOURS)
      .optional()
      .default(defaultHours),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
    cursor: z.string().optional(),
  });
}

export const ReviewsQuerySchema = makeReviewsQuerySchema();
export type ReviewsQuerySchemaType = ReturnType<typeof makeReviewsQuerySchema>;
export type ReviewsQuery = z.infer<typeof ReviewsQuerySchema>;
