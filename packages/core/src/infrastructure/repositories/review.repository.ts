import type {
  ReviewCursor,
  ReviewRepository,
  ReviewsPage,
} from "@packages/core/application/repositories/review.repository";
import type { Rating } from "@packages/core/domain/rating";
import type { Review } from "@packages/core/domain/review";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";

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

  async findRecentPage(
    appId: string,
    since: Date,
    opts: { limit: number; cursor?: ReviewCursor | null },
  ): Promise<ReviewsPage> {
    const { limit, cursor } = opts;

    const conds = [eq(reviews.appId, appId), gte(reviews.submittedAt, since)];
    // Keyset: only rows strictly "older" than the cursor in (submitted_at DESC, id DESC)
    // order. The row-value comparison `(a, b) < (c, d)` is evaluated element-wise by
    // Postgres, so `id` only breaks ties when timestamps are equal.
    if (cursor) {
      conds.push(
        sql`(${reviews.submittedAt}, ${reviews.id}) < (${cursor.submittedAt}, ${cursor.id})`,
      );
    }

    // Fetch one extra row to know whether a further page exists, without a COUNT.
    const rows = await this.db
      .select()
      .from(reviews)
      .where(and(...conds))
      .orderBy(desc(reviews.submittedAt), desc(reviews.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toReview);
    const last = items[items.length - 1];

    return {
      items,
      nextCursor: hasMore && last ? { submittedAt: last.submittedAt, id: last.id } : null,
    };
  }
}

function toReview(r: typeof reviews.$inferSelect): Review {
  return {
    id: r.id,
    appId: r.appId,
    author: r.author,
    title: r.title,
    content: r.content,
    rating: r.rating as Rating,
    version: r.version,
    submittedAt: r.submittedAt,
  };
}
