import { z } from "zod";
export const ReviewDtoSchema = z.object({
  id: z.string(),
  appId: z.string(),
  author: z.string(),
  title: z.string(),
  content: z.string(),
  rating: z.number().int().min(1).max(5),
  version: z.string().nullable(),
  submittedAt: z.string(),
});
export type ReviewDto = z.infer<typeof ReviewDtoSchema>;

/**
 * One page of reviews. `nextCursor` is an opaque token to fetch the following
 * page (newest-first); `null` means there are no more reviews in the window.
 */
export const ReviewsPageDtoSchema = z.object({
  items: z.array(ReviewDtoSchema),
  nextCursor: z.string().nullable(),
});
export type ReviewsPageDto = z.infer<typeof ReviewsPageDtoSchema>;
