import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { oauthGrantService } from "@/services/oauth/oauth-grant.service";

import { queryKeys } from "../query-keys";

export function useOAuthGrants() {
  return useQuery({
    queryKey: queryKeys.oauthGrants(),
    queryFn: () => oauthGrantService.getGrants(),
  });
}

export function useRevokeOAuthGrant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => oauthGrantService.revokeGrant(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.oauthGrants() });
    },
  });
}
