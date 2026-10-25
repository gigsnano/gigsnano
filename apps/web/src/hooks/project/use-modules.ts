import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { moduleService } from "@/services/project/module.service";
import type { IUpdateModulePayload } from "@/services/project/module.service";

import { queryKeys } from "../query-keys";

export function useModules(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.modules(workspaceSlug, projectId),
    queryFn: () => moduleService.getModules(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useModule(workspaceSlug: string, projectId: string, moduleId: string) {
  return useQuery({
    queryKey: queryKeys.module(workspaceSlug, projectId, moduleId),
    queryFn: () => moduleService.getModule(workspaceSlug, projectId, moduleId),
    enabled: Boolean(workspaceSlug && projectId && moduleId),
  });
}

export function useCreateModule(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      moduleService.createModule(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.modules(workspaceSlug, projectId) });
    },
  });
}

export function useUpdateModule(workspaceSlug: string, projectId: string, moduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateModulePayload) =>
      moduleService.updateModule(workspaceSlug, projectId, moduleId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.modules(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.module(workspaceSlug, projectId, moduleId) });
    },
  });
}
