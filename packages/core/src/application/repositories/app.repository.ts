import type { App } from "@packages/core/domain/app";
import type { Country } from "@packages/shared/index";

export interface AppRepository {
  list(): Promise<App[]>;
  findById(id: string): Promise<App | null>;
  create(input: { id: string; name?: string | null; country?: Country }): Promise<App>; // idempotent
  findDueForSync(staleBefore: Date): Promise<App[]>; // apps with NO successful run finished after staleBefore
}
