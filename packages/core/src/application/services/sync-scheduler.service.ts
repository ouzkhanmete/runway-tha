import type { AppMetadataClient } from "@packages/core/application/api-clients/app-metadata.api-client";
import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import type { App } from "@packages/core/domain/app";
import { subMilliseconds } from "date-fns";
import { mapWithConcurrency } from "./concurrency";
import type { IngestReviewsService } from "./ingest-reviews.service";

interface SyncSchedulerDeps {
  apps: AppRepository;
  ingest: IngestReviewsService;
  /** Fills in an app's display name (the reviews feed doesn't carry it). */
  appMetadata: AppMetadataClient;
  stalenessMs: number;
  /** A claim older than this is treated as stuck (crashed worker) and may be reclaimed. */
  claimTtlMs: number;
  concurrency: number;
  clock?: () => Date;
}

export class SyncSchedulerService {
  constructor(private deps: SyncSchedulerDeps) {}

  async runDueOnce(): Promise<{ processed: number; failed: number }> {
    const now = (this.deps.clock ?? (() => new Date()))();
    const staleBefore = subMilliseconds(now, this.deps.stalenessMs);
    const claimExpiredBefore = subMilliseconds(now, this.deps.claimTtlMs);
    // Atomically claim the due apps. With multiple workers running, each app is handed
    // to exactly one of them — the claim is a single locked UPDATE inside the repo.
    const claimed = await this.deps.apps.claimDueForSync({
      staleBefore,
      claimExpiredBefore,
      claimedAt: now,
    });
    let failed = 0;
    await mapWithConcurrency(claimed, this.deps.concurrency, async (app) => {
      try {
        await this.deps.ingest.ingestApp(app);
      } catch {
        failed++; // ingestApp already records an error sync_run
      } finally {
        // Best-effort name backfill + lease release. Both are non-fatal: a failed
        // enrich/release never affects `failed`, and the claim TTL recovers a missed release.
        await this.enrichName(app).catch(() => {});
        await this.deps.apps.releaseClaim(app.id).catch(() => {});
      }
    });
    return { processed: claimed.length, failed };
  }

  /** Fills the app's display name from the lookup API the first time we see it (name === null). */
  private async enrichName(app: App): Promise<void> {
    if (app.name) return;
    const name = await this.deps.appMetadata.fetchAppName(app.id, app.country);
    if (name) await this.deps.apps.updateName(app.id, name);
  }
}
