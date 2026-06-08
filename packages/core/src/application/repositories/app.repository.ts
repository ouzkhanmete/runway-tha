import type { App } from "@packages/core/domain/app";
import type { Country } from "@packages/shared/index";

export interface AppRepository {
  list(): Promise<App[]>;
  findById(id: string): Promise<App | null>;
  create(input: { id: string; name?: string | null; country?: Country }): Promise<App>; // idempotent

  /**
   * Atomically claims apps that are due for a sync and returns them, stamping each
   * with `claimedAt`. An app is due when it has NO successful run finished after
   * `staleBefore` (the cooldown) AND is not currently claimed — i.e. `claimed_at`
   * is NULL or older than `claimExpiredBefore` (a stuck/crashed claim).
   *
   * Implemented as a single `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`
   * statement so that concurrent workers never claim the same app.
   */
  claimDueForSync(opts: {
    staleBefore: Date;
    claimExpiredBefore: Date;
    claimedAt: Date;
  }): Promise<App[]>;

  /** Releases the claim lease (sets `claimed_at` back to NULL). Called after a sync finishes. */
  releaseClaim(appId: string): Promise<void>;

  /** Sets the app's display name (filled by the worker from the lookup API). */
  updateName(appId: string, name: string): Promise<void>;
}
