import type { App, Review } from "@packages/core/index";
import type { AppDto, ReviewDto } from "@packages/shared/index";
import { formatISO } from "date-fns";

export function toReviewDto(r: Review): ReviewDto {
  return {
    id: r.id,
    appId: r.appId,
    author: r.author,
    title: r.title,
    content: r.content,
    rating: r.rating,
    version: r.version,
    submittedAt: formatISO(r.submittedAt),
  };
}

export function toAppDto(a: App): AppDto {
  return {
    id: a.id,
    name: a.name,
    country: a.country,
    createdAt: formatISO(a.createdAt),
    claimedAt: a.claimedAt ? formatISO(a.claimedAt) : null,
  };
}
