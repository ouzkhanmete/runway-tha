import { Country } from "@packages/shared/index";

export interface App {
  id: string;
  name: string | null;
  country: Country;
  createdAt: Date;
  // When non-null and recent, a worker is currently syncing this app (the claim lease).
  claimedAt: Date | null;
}
