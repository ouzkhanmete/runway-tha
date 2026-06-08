import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

export function useApps() {
  return useQuery({
    queryKey: ["apps"],
    queryFn: apiClient.getApps,
  });
}
