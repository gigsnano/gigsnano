import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { templateService } from "@/services/template/template.service";
import type {
  ICreateRecurrencePayload,
  ICreateTemplatePayload,
  IUpdateTemplatePayload,
} from "@/types";

import { queryKeys } from "../query-keys";

// ---- Templates ----
export function useTemplates(workspaceSlug: string, kind?: string) {
  return useQuery({
    queryKey: queryKeys.templates(workspaceSlug, kind),
    queryFn: () => templateService.getTemplates(workspaceSlug, kind),
    enabled: Boolean(workspaceSlug),
  });
}

function useTemplateInvalidator(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: ["workspaces", workspaceSlug, "templates"],
    });
}

export function useCreateTemplate(workspaceSlug: string) {
  const invalidate = useTemplateInvalidator(workspaceSlug);
  return useMutation({
    mutationFn: (payload: ICreateTemplatePayload) =>
      templateService.createTemplate(workspaceSlug, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateTemplate(workspaceSlug: string) {
  const invalidate = useTemplateInvalidator(workspaceSlug);
  return useMutation({
    mutationFn: ({ templateId, payload }: { templateId: string; payload: IUpdateTemplatePayload }) =>
      templateService.updateTemplate(workspaceSlug, templateId, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate(workspaceSlug: string) {
  const invalidate = useTemplateInvalidator(workspaceSlug);
  return useMutation({
    mutationFn: (templateId: string) => templateService.deleteTemplate(workspaceSlug, templateId),
    onSuccess: invalidate,
  });
}

export function useDraftTemplate(workspaceSlug: string) {
  // eslint-disable-next-line react-doctor/query-mutation-missing-invalidation -- draft is an unsaved suggestion; nothing to invalidate.
  return useMutation({
    mutationFn: (text: string) => templateService.draftTemplate(workspaceSlug, text),
  });
}

export function useApplyTemplate(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, templateId }: { projectId: string; templateId: string }) =>
      templateService.applyTemplate(workspaceSlug, projectId, templateId),
    onSuccess: (_data, { projectId }) => {
      // A story was created — refresh the target project's story views.
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
    },
  });
}

// ---- Recurrences ----
export function useRecurrences(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.recurrences(workspaceSlug, projectId),
    queryFn: () => templateService.getRecurrences(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useCreateRecurrence(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateRecurrencePayload) =>
      templateService.createRecurrence(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurrences(workspaceSlug, projectId) });
    },
  });
}

export function useSetRecurrenceEnabled(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recurrenceId, enabled }: { recurrenceId: string; enabled: boolean }) =>
      templateService.setRecurrenceEnabled(workspaceSlug, projectId, recurrenceId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurrences(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteRecurrence(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recurrenceId: string) =>
      templateService.deleteRecurrence(workspaceSlug, projectId, recurrenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurrences(workspaceSlug, projectId) });
    },
  });
}
