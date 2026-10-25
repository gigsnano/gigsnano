import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { projectSettingsService } from "@/services/project/project-settings.service";
import type {
  ICreateCustomFieldPayload,
  ICreateProjectLabelPayload,
  ICreateProjectStatePayload,
  ICreateProjectEstimatePayload,
  ICreateProjectAutomationPayload,
  IUpdateCustomFieldPayload,
  IUpdateProjectPayload,
} from "@/types";
import { EStateGroup, EStoryStatus } from "@/types";

import { queryKeys } from "../query-keys";

export function useUpdateProject(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdateProjectPayload) =>
      projectSettingsService.updateProject(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
    },
  });
}

export function useProjectLabels(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectLabels(workspaceSlug, projectId),
    queryFn: () => projectSettingsService.getLabels(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectLabel(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateProjectLabelPayload) =>
      projectSettingsService.createLabel(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectLabels(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteProjectLabel(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) =>
      projectSettingsService.deleteLabel(workspaceSlug, projectId, labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectLabels(workspaceSlug, projectId) });
    },
  });
}

export function useProjectStates(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectStates(workspaceSlug, projectId),
    queryFn: () => projectSettingsService.getStates(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectState(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateProjectStatePayload) =>
      projectSettingsService.createState(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectStates(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteProjectState(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stateId: string) =>
      projectSettingsService.deleteState(workspaceSlug, projectId, stateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectStates(workspaceSlug, projectId) });
    },
  });
}

export function useProjectFeatures(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectFeatures(workspaceSlug, projectId),
    queryFn: () => projectSettingsService.getFeatures(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

export function useUpdateProjectFeature(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ featureId, enabled }: { featureId: string; enabled: boolean }) =>
      projectSettingsService.updateFeature(workspaceSlug, projectId, featureId, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectFeatures(workspaceSlug, projectId) });
    },
  });
}

export function useProjectEstimates(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectEstimates(workspaceSlug, projectId),
    queryFn: () => projectSettingsService.getEstimates(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectEstimate(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateProjectEstimatePayload) =>
      projectSettingsService.createEstimate(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectEstimates(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteProjectEstimate(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (estimateId: string) =>
      projectSettingsService.deleteEstimate(workspaceSlug, projectId, estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectEstimates(workspaceSlug, projectId) });
    },
  });
}

export function useProjectAutomations(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectAutomations(workspaceSlug, projectId),
    queryFn: () => projectSettingsService.getAutomations(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectAutomation(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateProjectAutomationPayload) =>
      projectSettingsService.createAutomation(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectAutomations(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteProjectAutomation(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationId: string) =>
      projectSettingsService.deleteAutomation(workspaceSlug, projectId, automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectAutomations(workspaceSlug, projectId) });
    },
  });
}

export function useCustomFields(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.customFields(workspaceSlug, projectId),
    queryFn: () => projectSettingsService.getCustomFields(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

export function useCreateCustomField(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateCustomFieldPayload) =>
      projectSettingsService.createCustomField(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields(workspaceSlug, projectId) });
    },
  });
}

export function useUpdateCustomField(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      customFieldId,
      payload,
    }: {
      customFieldId: string;
      payload: IUpdateCustomFieldPayload;
    }) => projectSettingsService.updateCustomField(workspaceSlug, projectId, customFieldId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields(workspaceSlug, projectId) });
    },
  });
}

export function useDeleteCustomField(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customFieldId: string) =>
      projectSettingsService.deleteCustomField(workspaceSlug, projectId, customFieldId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customFields(workspaceSlug, projectId) });
      // A removed field's value must disappear from story detail panels — mirror
      // the GIN-75 import's story-family invalidation (prefix match, not the
      // exact-key projectStories/workspaceStories factories, so every nested
      // story query — list, page, detail, sub-stories, thread — gets refetched).
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
    },
  });
}

const DEFAULT_COLUMN_LABELS: Record<EStoryStatus, string> = {
  [EStoryStatus.Todo]: "To do",
  [EStoryStatus.InProgress]: "In progress",
  [EStoryStatus.InReview]: "In review",
  [EStoryStatus.Done]: "Done",
};

export function useProjectFeatureFlags(workspaceSlug: string, projectId: string) {
  const query = useProjectFeatures(workspaceSlug, projectId);

  const map = new Map((query.data ?? []).map((f) => [f.key, f.enabled]));
  const flags = {
    cycles: map.get("cycles") ?? true,
    modules: map.get("modules") ?? true,
    views: map.get("views") ?? true,
    pages: map.get("pages") ?? false,
  };

  return { ...flags, isPending: query.isPending };
}

export function useProjectStateLabels(workspaceSlug: string, projectId: string) {
  const { data: states, isPending } = useProjectStates(workspaceSlug, projectId);

  const labels = (() => {
    if (!states?.length) return DEFAULT_COLUMN_LABELS;

    const unstarted = states
      .filter((s) => s.group === EStateGroup.Backlog || s.group === EStateGroup.Unstarted)
      .sort((a, b) => a.order - b.order);
    const started = states
      .filter((s) => s.group === EStateGroup.Started)
      .sort((a, b) => a.order - b.order);
    const completed = states
      .filter((s) => s.group === EStateGroup.Completed)
      .sort((a, b) => a.order - b.order);

    return {
      [EStoryStatus.Todo]: unstarted[0]?.name ?? DEFAULT_COLUMN_LABELS[EStoryStatus.Todo],
      [EStoryStatus.InProgress]:
        started[0]?.name ?? DEFAULT_COLUMN_LABELS[EStoryStatus.InProgress],
      [EStoryStatus.InReview]:
        started[1]?.name ?? started[0]?.name ?? DEFAULT_COLUMN_LABELS[EStoryStatus.InReview],
      [EStoryStatus.Done]: completed[0]?.name ?? DEFAULT_COLUMN_LABELS[EStoryStatus.Done],
    };
  })();

  return { labels, isPending };
}
