import type { Review } from "@runway/core";
import type { App } from "@runway/core";
import type { ReviewDto, AppDto } from "@runway/shared";

export function toReviewDto(r: Review): ReviewDto {
  return {
    id: r.id,
    appId: r.appId,
    author: r.author,
    title: r.title,
    content: r.content,
    rating: r.rating,
    version: r.version,
    submittedAt: r.submittedAt.toISOString(),
  };
}

export function toAppDto(a: App): AppDto {
  return {
    id: a.id,
    name: a.name,
    country: a.country,
    createdAt: a.createdAt.toISOString(),
  };
}
