import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

export function useReviews(appId: string | undefined, windowHours: number) {
  return useQuery({
    queryKey: ["reviews", appId, windowHours],
    queryFn: () => apiClient.getReviews(appId!, windowHours),
    enabled: !!appId,
  });
}
