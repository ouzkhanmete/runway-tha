import { Country } from "@packages/shared/index";

export interface App {
  id: string;
  name: string | null;
  country: Country;
  createdAt: Date;
}
