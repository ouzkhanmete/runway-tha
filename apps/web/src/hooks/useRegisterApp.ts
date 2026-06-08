import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api/client";

export function useRegisterApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appId, country }: { appId: string; country?: string }) =>
      apiClient.registerApp(appId, country),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps"] });
    },
  });
}
