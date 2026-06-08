import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

/**
 * Infinite (cursor-paginated) reviews query. Each page is 5 reviews; the opaque
 * `nextCursor` from one page is the `pageParam` for the next. Pages are exposed via
 * `data.pages`; the UI flattens them and an IntersectionObserver triggers
 * `fetchNextPage`.
 */
export function useReviews(appId: string | undefined, windowHours: number) {
  return useInfiniteQuery({
    queryKey: ["reviews", appId, windowHours],
    queryFn: ({ pageParam }) => apiClient.getReviews(appId!, windowHours, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!appId,
  });
}
