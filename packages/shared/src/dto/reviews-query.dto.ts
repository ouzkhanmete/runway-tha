import { z } from "zod";

/** Review window bounds in hours. Default 48h; max 720h (the feed only spans the ~500 most recent reviews). */
export const MIN_WINDOW_HOURS = 1;
export const MAX_WINDOW_HOURS = 720;
export const DEFAULT_WINDOW_HOURS = 48;

/**
 * Build the `windowHours` query schema. `windowHours` is an integer in
 * [1, 720]; when omitted it defaults to `defaultHours` (48 → the last 48 hours).
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
  });
}

export const ReviewsQuerySchema = makeReviewsQuerySchema();
export type ReviewsQuerySchemaType = ReturnType<typeof makeReviewsQuerySchema>;
export type ReviewsQuery = z.infer<typeof ReviewsQuerySchema>;
