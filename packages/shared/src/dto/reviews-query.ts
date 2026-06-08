import { z } from "zod";
export const ALLOWED_WINDOW_HOURS = [48, 168, 720] as const;
export const ReviewsQuerySchema = z.object({
  windowHours: z.coerce.number().int().optional().default(48)
    .refine((h) => (ALLOWED_WINDOW_HOURS as readonly number[]).includes(h), "unsupported windowHours"),
});
export type ReviewsQuery = z.infer<typeof ReviewsQuerySchema>;
