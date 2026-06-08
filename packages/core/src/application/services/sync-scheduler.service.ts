import type { AppRepository } from "../ports/app-repository";
import type { IngestReviewsService } from "./ingest-reviews.service";
import { mapWithConcurrency } from "./concurrency";

interface SyncSchedulerDeps {
  apps: AppRepository;
  ingest: IngestReviewsService;
  stalenessMin: number;
  concurrency: number;
  clock?: () => Date;
}

export class SyncSchedulerService {
  constructor(private deps: SyncSchedulerDeps) {}

  async runDueOnce(): Promise<{ processed: number; failed: number }> {
    const now = (this.deps.clock ?? (() => new Date()))();
    const staleBefore = new Date(now.getTime() - this.deps.stalenessMin * 60_000);
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
