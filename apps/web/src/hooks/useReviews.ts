import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

/**
 * Infinite (cursor-paginated) reviews query. Each page is 5 reviews; the opaque
 * `nextCursor` from one page is the `pageParam` for the next. Pages are exposed via
 * `data.pages`; the UI flattens them and an IntersectionObserver triggers
 * `fetchNextPage`.
 *
 * When `pollUntilData` is set (e.g. right after registering an app), the query
 * refetches every few seconds until the first reviews land — so the worker's next
 * tick surfaces them automatically without a manual refresh.
 */
export function useReviews(
  appId: string | undefined,
  windowHours: number,
  opts?: { pollUntilData?: boolean },
) {
  return useInfiniteQuery({
    queryKey: ["reviews", appId, windowHours],
    queryFn: ({ pageParam }) => apiClient.getReviews(appId!, windowHours, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!appId,
    refetchInterval: (query) => {
      if (!opts?.pollUntilData) return false;
      const hasItems = query.state.data?.pages.some((page) => page.items.length > 0);
      return hasItems ? false : 2500; // keep polling until the first batch arrives
    },
  });
}
