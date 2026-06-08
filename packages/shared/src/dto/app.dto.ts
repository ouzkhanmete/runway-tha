import { z } from "zod";
import { Country } from "../enums/country";

export const AppDtoSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  country: z.string(),
  createdAt: z.string(),
  // ISO timestamp while a worker is currently syncing this app, else null. Visibility only.
  claimedAt: z.string().nullable(),
});
export type AppDto = z.infer<typeof AppDtoSchema>;

export const RegisterAppRequestSchema = z.object({
  appId: z.string().regex(/^\d+$/, "appId must be numeric"),
  country: z.enum(Country).optional(),
});
export type RegisterAppRequest = z.infer<typeof RegisterAppRequestSchema>;
