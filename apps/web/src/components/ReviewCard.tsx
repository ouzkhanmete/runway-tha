import type { ReviewDto } from "@packages/shared/index";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { RatingStars } from "./RatingStars";

interface ReviewCardProps {
  review: ReviewDto;
}

export function ReviewCard({ review }: ReviewCardProps) {
  const date = parseISO(review.submittedAt);
  const relativeTime = formatDistanceToNow(date, { addSuffix: true });
  const absoluteTime = format(date, "PPpp");

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
        <abbr title={absoluteTime}>{relativeTime}</abbr> <span>({absoluteTime})</span>
      </div>
      <p className="review-card-content">{review.content}</p>
      {review.version && <div className="review-card-version">Version {review.version}</div>}
    </article>
  );
}
