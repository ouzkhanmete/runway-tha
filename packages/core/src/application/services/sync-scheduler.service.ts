import type { AppRepository } from "@packages/core/application/repositories/app.repository";
import { subMilliseconds } from "date-fns";
import { mapWithConcurrency } from "./concurrency";
import type { IngestReviewsService } from "./ingest-reviews.service";

interface SyncSchedulerDeps {
  apps: AppRepository;
  ingest: IngestReviewsService;
  stalenessMs: number;
  concurrency: number;
  clock?: () => Date;
}

export class SyncSchedulerService {
  constructor(private deps: SyncSchedulerDeps) {}

  async runDueOnce(): Promise<{ processed: number; failed: number }> {
    const now = (this.deps.clock ?? (() => new Date()))();
    const staleBefore = subMilliseconds(now, this.deps.stalenessMs);
    const due = await this.deps.apps.findDueForSync(staleBefore);
    let failed = 0;
    await mapWithConcurrency(due, this.deps.concurrency, async (app) => {
      try {
        await this.deps.ingest.ingestApp(app);
      } catch {
        failed++; // ingestApp already records an error sync_run
      }
    });
    return { processed: due.length, failed };
  }
}
