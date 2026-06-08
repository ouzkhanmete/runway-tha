import { NotFoundError, ValidationError } from "@packages/core/index";
import type { Context } from "hono";
import { ZodError } from "zod";

export function errorHandler(err: unknown, c: Context) {
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "VALIDATION",
          message: "Invalid request",
          details: err.issues,
        },
      },
      400,
    );
  }

  if (err instanceof ValidationError) {
    return c.json(
      {
        error: {
          code: "VALIDATION",
          message: err.message,
        },
      },
      400,
    );
  }

  if (err instanceof NotFoundError) {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: err.message,
        },
      },
      404,
    );
  }

  console.error("[api] Unhandled error:", err);
  return c.json(
    {
      error: {
        code: "INTERNAL",
        message: "Internal server error",
      },
    },
    500,
  );
}
