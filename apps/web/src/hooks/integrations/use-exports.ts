import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { exportService } from "@/services/integrations/export.service";
import { EExportStatus } from "@/types";
import type { ICreateExportPayload, IExportFilters } from "@/types";

import { queryKeys } from "../query-keys";

const PENDING_POLL_MS = 2000;

export function useExports(workspaceSlug: string, filters: IExportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.exports(workspaceSlug, filters),
    queryFn: () => exportService.getExports(workspaceSlug, filters),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasPending = items.some((job) => job.status === EExportStatus.Pending);
      return hasPending ? PENDING_POLL_MS : false;
    },
  });
}

export function useCreateExport(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateExportPayload) =>
      exportService.createExport(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "exports"] });
    },
  });
}
