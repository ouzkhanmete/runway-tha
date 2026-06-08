import type { ReviewDto } from "@packages/shared/index";
import { useEffect, useRef } from "react";
import { ReviewCard } from "./ReviewCard";

interface ReviewListProps {
  reviews: ReviewDto[] | undefined;
  isLoading: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** True while a just-added app is awaiting its first sync (shows a loader, not the empty state). */
  isAwaitingFirstSync?: boolean;
}

export function ReviewList({
  reviews,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  isAwaitingFirstSync = false,
}: ReviewListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, onLoadMore]);

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
    if (isAwaitingFirstSync) {
      return (
        <div className="review-list-state">
          <span className="loading-spinner" aria-hidden="true" />
          Fetching the latest reviews… this can take a few seconds for a newly added app.
        </div>
      );
    }
    return (
      <div className="review-list-state">
        <h3>No reviews found</h3>
        <p>
          No reviews were submitted in the selected time window. The default window is 48 hours,
          which may show no results for apps with lower review velocity. Try a wider window to see
          more reviews.
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

      {/* Sentinel watched by the IntersectionObserver to trigger the next page. */}
      <div ref={sentinelRef} className="review-list-sentinel" aria-hidden="true" />

      {isFetchingNextPage && (
        <div className="review-list-state">
          <span className="loading-spinner" aria-hidden="true" />
          Loading more…
        </div>
      )}
      {!hasNextPage && (
        <div className="review-list-end" role="status">
          You've reached the end.
        </div>
      )}
    </div>
  );
}
