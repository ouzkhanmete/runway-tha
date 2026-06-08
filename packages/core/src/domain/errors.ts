export class NotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "NotFoundError";
  }
}

/** A bad client input that isn't a Zod schema failure (e.g. an undecodable cursor). Maps to 400. */
export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ValidationError";
  }
}
