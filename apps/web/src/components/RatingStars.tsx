interface RatingStarsProps {
  rating: number;
}

export function RatingStars({ rating }: RatingStarsProps) {
  const stars = Array.from({ length: 5 }, (_, i) => i + 1);

  return (
    <span
      className="rating-stars"
      aria-label={`${rating} out of 5`}
      role="img"
    >
      {stars.map((star) => (
        <span
          key={star}
          className={star <= rating ? "star-filled" : "star-empty"}
          aria-hidden="true"
        >
          {star <= rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
