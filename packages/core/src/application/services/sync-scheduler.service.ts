import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import { subMilliseconds } from "date-fns";
import { mapWithConcurrency } from "./concurrency";
import type { IngestReviewsService } from "./ingest-reviews.service";

interface SyncSchedulerDeps {
  apps: AppRepository;
  ingest: IngestReviewsService;
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
        // Release the lease regardless of outcome so visibility stays accurate. A failed
        // release is non-fatal: the claim TTL will let another tick reclaim the app.
        await this.deps.apps.releaseClaim(app.id).catch(() => {});
      }
    });
    return { processed: claimed.length, failed };
  }
}
