import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { digestService } from "@/services/workspace/digest.service";
import type { IDigestPreference, IDigestPreferenceUpdate } from "@/types";

import { queryKeys } from "../query-keys";

export function useDigestPreferences(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.digestPreferences(workspaceSlug),
    queryFn: () => digestService.getPreferences(workspaceSlug),
  });
}

export function useUpdateDigestPreferences(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IDigestPreferenceUpdate) =>
      digestService.updatePreferences(workspaceSlug, payload),
    onSuccess: (pref: IDigestPreference) => {
      queryClient.setQueryData(queryKeys.digestPreferences(workspaceSlug), pref);
    },
  });
}
