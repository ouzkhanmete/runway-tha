import type { ReviewDto } from "@runway/shared";
import { RatingStars } from "./RatingStars";

interface ReviewCardProps {
  review: ReviewDto;
}

function formatRelativeTime(dateStr: string): string {
  const submitted = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - submitted.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffSeconds) < 60) return rtf.format(-diffSeconds, "second");
  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, "minute");
  if (Math.abs(diffHours) < 24) return rtf.format(-diffHours, "hour");
  if (Math.abs(diffDays) < 7) return rtf.format(-diffDays, "day");
  if (Math.abs(diffWeeks) < 5) return rtf.format(-diffWeeks, "week");
  if (Math.abs(diffMonths) < 12) return rtf.format(-diffMonths, "month");
  return rtf.format(-diffYears, "year");
}

export function ReviewCard({ review }: ReviewCardProps) {
  const absoluteTime = new Date(review.submittedAt).toLocaleString();
  const relativeTime = formatRelativeTime(review.submittedAt);

  return (
    <article className="review-card">
      <div className="review-card-header">
        <span className="review-card-title">{review.title}</span>
        <div className="review-card-meta">
          <RatingStars rating={review.rating} />
          <span className="review-card-author">{review.author}</span>
        </div>
      </div>
      <div className="review-card-time">
        <abbr title={absoluteTime}>{relativeTime}</abbr>
        {" "}
        <span>({absoluteTime})</span>
      </div>
      <p className="review-card-content">{review.content}</p>
      {review.version && (
        <div className="review-card-version">Version {review.version}</div>
      )}
    </article>
  );
}
