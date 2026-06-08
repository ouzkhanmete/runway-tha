import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

export function useApps() {
  return useQuery({
    queryKey: ["apps"],
    queryFn: apiClient.getApps,
    // While any app is still missing its name (just seeded/added, not yet enriched
    // by the worker), poll so the name appears automatically; stop once all are filled.
    refetchInterval: (query) => (query.state.data?.some((a) => a.name === null) ? 5000 : false),
  });
}
