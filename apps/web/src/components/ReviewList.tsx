import type { ReviewDto } from "@runway/shared";
import { ReviewCard } from "./ReviewCard";

interface ReviewListProps {
  reviews: ReviewDto[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function ReviewList({ reviews, isLoading, error }: ReviewListProps) {
  if (isLoading) {
    return (
      <div className="review-list-state">
        <span className="loading-spinner" aria-hidden="true" />
        Loading reviews…
      </div>
    );
  }

  if (error) {
    return (
      <div className="review-list-state error">
        <h3>Failed to load reviews</h3>
        <p>{error.message}</p>
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div className="review-list-state">
        <h3>No reviews found</h3>
        <p>
          No reviews were submitted in the selected time window. The default
          window is 48 hours, which may show no results for apps with lower
          review velocity. Try a wider window (7 days or 30 days) to see more
          reviews.
        </p>
      </div>
    );
  }

  return (
    <div className="review-list" role="list">
      {reviews.map((review) => (
        <div key={review.id} role="listitem">
          <ReviewCard review={review} />
        </div>
      ))}
    </div>
  );
}
