// Config / env
export * from "./config/env";

// DB infrastructure
export * from "./infrastructure/db/client";
export * as schema from "./infrastructure/db/schema";

// Domain types
export * from "./domain/rating";
export * from "./domain/review";
export * from "./domain/app";
export * from "./domain/sync-run";
export * from "./domain/errors";

// Application ports (interfaces)
export * from "./application/ports/review-repository";
export * from "./application/ports/app-repository";
export * from "./application/ports/sync-run-repository";
export * from "./application/ports/review-feed-client";

// Application services
export * from "./application/services/ingest-reviews.service";
export * from "./application/services/review-query.service";
export * from "./application/services/app-registry.service";
export * from "./application/services/concurrency";
export * from "./application/services/sync-scheduler.service";

// Infrastructure: feed
export * from "./infrastructure/feed/feed-types";
export * from "./infrastructure/feed/review-mapper";
export * from "./infrastructure/feed/app-store-feed-client";

// Infrastructure: repositories
export * from "./infrastructure/repositories/review.repository";
export * from "./infrastructure/repositories/app.repository";
export * from "./infrastructure/repositories/sync-run.repository";
