import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema";
export function createDb(url: string) {
  return drizzle({ client: new SQL(url), schema });
}
export type Db = ReturnType<typeof createDb>;
export { schema };
