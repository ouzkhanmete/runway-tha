import { type ReviewCursor, ValidationError } from "@packages/core/index";

/**
 * Opaque keyset cursor codec. A cursor encodes the (submittedAt, id) of the last
 * review on a page as base64url'd JSON, so clients treat it as a meaningless token
 * and we keep freedom to change the keyset. `decode` rejects anything malformed
 * with a ValidationError (→ 400) rather than trusting client input.
 */
export function encodeCursor(c: ReviewCursor): string {
  const json = JSON.stringify({ t: c.submittedAt.toISOString(), i: c.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): ReviewCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid cursor");
  }

  const obj = parsed as { t?: unknown; i?: unknown };
  const submittedAt = typeof obj.t === "string" ? new Date(obj.t) : null;
  if (!submittedAt || Number.isNaN(submittedAt.getTime()) || typeof obj.i !== "string") {
    throw new ValidationError("Invalid cursor");
  }
  return { submittedAt, id: obj.i };
}
