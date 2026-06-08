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
