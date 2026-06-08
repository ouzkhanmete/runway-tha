import { sql, eq, and, gte, desc } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import type { ReviewRepository } from "../../application/ports/review-repository";
import type { Review } from "../../domain/review";
import type { Rating } from "../../domain/rating";

const { reviews } = schema;

export class DrizzleReviewRepository implements ReviewRepository {
  constructor(private db: Db) {}

  async upsertMany(items: Review[]): Promise<number> {
    if (items.length === 0) return 0;

    const rows = items.map((r) => ({
      id: r.id,
      appId: r.appId,
      author: r.author,
      title: r.title,
      content: r.content,
      rating: r.rating,
      version: r.version,
      submittedAt: r.submittedAt,
    }));

    await this.db
      .insert(reviews)
      .values(rows)
      .onConflictDoUpdate({
        target: reviews.id,
        set: {
          author: sql`excluded.author`,
          title: sql`excluded.title`,
          content: sql`excluded.content`,
          rating: sql`excluded.rating`,
          version: sql`excluded.version`,
          submittedAt: sql`excluded.submitted_at`,
          fetchedAt: sql`now()`,
        },
      });

    return items.length;
  }

  async findRecent(appId: string, since: Date): Promise<Review[]> {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.appId, appId), gte(reviews.submittedAt, since)))
      .orderBy(desc(reviews.submittedAt));

    return rows.map((r) => ({
        id: r.id,
        appId: r.appId,
        author: r.author,
        title: r.title,
        content: r.content,
        rating: r.rating as Rating,
        version: r.version,
        submittedAt: r.submittedAt,
      }));
  }
}
