import { z } from "zod";

/** Comma-separated string -> trimmed non-empty string[]. */
function splitCsv(s: string): string[] {
  return s.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Build a schema that reads a comma-separated env string (with a default)
 * and parses it into a `string[]`.
 */
function csvStrings(def: string) {
  return z.string().default(def).transform(splitCsv);
}

/**
 * Build a schema that reads a comma-separated env string (with a default)
 * and parses it into an int `number[]`, validating each item is an integer.
 */
function csvInts(def: string) {
  return z
    .string()
    .default(def)
    .transform((s, ctx) => {
      const out: number[] = [];
      for (const part of splitCsv(s)) {
        const n = Number(part);
        if (!Number.isInteger(n)) {
          ctx.addIssue({ code: "custom", message: `not an integer: "${part}"` });
          return z.NEVER;
        }
        out.push(n);
      }
      return out;
    });
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().default("postgres://runway:runway@localhost:5432/runway"),
  APP_PORT: z.coerce.number().int().default(3000),
  REVIEW_WINDOW_HOURS_DEFAULT: z.coerce.number().int().default(48),
  REVIEW_WINDOW_HOURS_ALLOWED: csvInts("48,168,720"),
  WORKER_TICK_MS: z.coerce.number().int().default(60000),
  WORKER_STALENESS_MIN: z.coerce.number().int().default(15),
  WORKER_MAX_PAGES: z.coerce.number().int().default(10),
  WORKER_CONCURRENCY: z.coerce.number().int().default(3),
  WORKER_MAX_RETRIES: z.coerce.number().int().default(3),
  SEED_APP_IDS: csvStrings("595068606"),
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
