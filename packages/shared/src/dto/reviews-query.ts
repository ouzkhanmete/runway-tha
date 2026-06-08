import { z } from "zod";

/** Default allow-list of supported review window sizes (hours): 48h / 7d / 30d. */
export const ALLOWED_WINDOW_HOURS = [48, 168, 720] as const;

/**
 * Build a `windowHours` query schema from a configurable allow-list and default.
 * The API boundary builds this from env (`REVIEW_WINDOW_HOURS_ALLOWED` /
 * `REVIEW_WINDOW_HOURS_DEFAULT`); the exported `ReviewsQuerySchema` uses the
 * built-in defaults and is reused by the FE.
 */
export function makeReviewsQuerySchema(
  allowed: readonly number[] = ALLOWED_WINDOW_HOURS,
  defaultHours = 48,
) {
  return z.object({
    windowHours: z.coerce
      .number()
      .int()
      .optional()
      .default(defaultHours)
      .refine((h) => allowed.includes(h), "unsupported windowHours"),
  });
}

export const ReviewsQuerySchema = makeReviewsQuerySchema();
export type ReviewsQuerySchemaType = ReturnType<typeof makeReviewsQuerySchema>;
export type ReviewsQuery = z.infer<typeof ReviewsQuerySchema>;
