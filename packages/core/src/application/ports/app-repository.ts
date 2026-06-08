import type { App } from "../../domain/app";

export interface AppRepository {
  list(): Promise<App[]>;
  findById(id: string): Promise<App | null>;
  create(input: { id: string; name?: string | null; country?: string }): Promise<App>; // idempotent
  findDueForSync(staleBefore: Date): Promise<App[]>; // apps with NO successful run finished after staleBefore
}
