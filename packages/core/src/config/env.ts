import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().default("postgres://runway:runway@localhost:5432/runway"),
  APP_PORT: z.coerce.number().int().default(3000),
  REVIEW_WINDOW_HOURS_DEFAULT: z.coerce.number().int().default(48),
  WORKER_TICK_MS: z.coerce.number().int().default(10000),
  WORKER_STALENESS_MS: z.coerce.number().int().default(900000),
  WORKER_CLAIM_TTL_MS: z.coerce.number().int().default(300000),
  WORKER_MAX_PAGES: z.coerce.number().int().default(10),
  WORKER_CONCURRENCY: z.coerce.number().int().default(3),
  WORKER_MAX_RETRIES: z.coerce.number().int().default(3),
  FEED_BASE_URL: z.string().default("https://itunes.apple.com"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validates `process.env` (or a provided source) against the schema, applying
 * the documented defaults. Throws a descriptive error if validation fails.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}
