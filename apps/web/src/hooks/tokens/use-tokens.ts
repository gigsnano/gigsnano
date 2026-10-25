import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tokenService } from "@/services/tokens/token.service";
import type { ICreateTokenPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useTokens() {
  return useQuery({ queryKey: queryKeys.tokens(), queryFn: () => tokenService.getTokens() });
}

export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateTokenPayload) => tokenService.createToken(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens() });
    },
  });
}

export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tokenService.revokeToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens() });
    },
  });
}
