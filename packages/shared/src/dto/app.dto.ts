import { z } from "zod";
export const AppDtoSchema = z.object({
  id: z.string(), name: z.string().nullable(), country: z.string(), createdAt: z.string(),
});
export type AppDto = z.infer<typeof AppDtoSchema>;
export const RegisterAppRequestSchema = z.object({
  appId: z.string().regex(/^\d+$/, "appId must be numeric"),
  country: z.string().length(2).optional(),
});
export type RegisterAppRequest = z.infer<typeof RegisterAppRequestSchema>;
