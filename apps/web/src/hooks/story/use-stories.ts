import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { storyService } from "@/services/story/story.service";
import type {
  ICloneStoryPayload,
  ICreateStoryPayload,
  IUpdateStoryPayload,
} from "@/services/story/story.service";
import type { EReadinessResult, ID, IMyStoriesFilters, IStory, IStoryFilters, IWorkspaceStoryFilters } from "@/types";
import { EStoryStatus, EDeleteCascade } from "@/types";
import { applyReorder } from "@/lib/issues/apply-reorder";

import { queryKeys } from "../query-keys";
import { optimisticById } from "../optimistic";

export function useMoveStory(
  workspaceSlug: string,
  projectId: string,
  cycleId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, status }: { storyId: string; status: EStoryStatus }) =>
      storyService.moveStory(workspaceSlug, projectId, storyId, status),
    ...optimisticById(
      queryClient,
      ["workspaces", workspaceSlug],
      (v: { storyId: string; status: EStoryStatus }) => v.storyId,
      (v) => ({ status: v.status }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

export function useCompleteStory(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      storyId,
      readinessResult,
    }: {
      storyId: string;
      readinessResult?: EReadinessResult;
    }) => storyService.completeStory(workspaceSlug, projectId, storyId, readinessResult),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

export function useSkipStory(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId: string) => storyService.skipStory(workspaceSlug, projectId, storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

export function useAssignStory(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, assigneeId }: { storyId: string; assigneeId: ID | null }) =>
      storyService.assignStory(workspaceSlug, projectId, storyId, assigneeId),
    ...optimisticById(
      queryClient,
      ["workspaces", workspaceSlug],
      (v: { storyId: string; assigneeId: ID | null }) => v.storyId,
      (v) => ({ assignee_id: v.assigneeId }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

export function useAssignStoryAgent(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, agentId }: { storyId: string; agentId: ID | null }) =>
      storyService.assignStoryAgent(workspaceSlug, projectId, storyId, agentId),
    ...optimisticById(
      queryClient,
      ["workspaces", workspaceSlug],
      (v: { storyId: string; agentId: ID | null }) => v.storyId,
      (v) => ({ ai_agent_id: v.agentId }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

/** Generic story patch (priority, dates, status, …) used by inline pickers. */
export function useUpdateStory(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, patch }: { storyId: string; patch: IUpdateStoryPayload }) =>
      storyService.updateStory(workspaceSlug, projectId, storyId, patch),
    ...optimisticById(
      queryClient,
      ["workspaces", workspaceSlug],
      (v: { storyId: string; patch: IUpdateStoryPayload }) => v.storyId,
      (v) => ({ ...v.patch }),
    ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      // History log (GIN-267/268 restore) gets a new row on every patch — refetch so
      // the activity feed shows it without a manual reload.
      queryClient.invalidateQueries({
        queryKey: queryKeys.storyHistory(workspaceSlug, projectId, variables.storyId),
      });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
      }
      // Not gated on `cycleId`: a patch can move the story INTO a cycle from a
      // screen that has no cycle context, and the cycle's story_count is stale.
      queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

export function useUpdateStoryLabels(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, labelIds }: { storyId: string; labelIds: ID[] }) =>
      storyService.updateStoryLabels(workspaceSlug, projectId, storyId, labelIds),
    ...optimisticById(
      queryClient,
      ["workspaces", workspaceSlug],
      (v: { storyId: string; labelIds: ID[] }) => v.storyId,
      // `label_id` is patched too so the optimistic row matches what the server
      // will send back (it derives the deprecated singular from the set).
      (v) => ({ label_ids: v.labelIds, label_id: v.labelIds[0] ?? null }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

export function useUpdateStoryEstimate(
  workspaceSlug: string,
  projectId: string,
  cycleId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      storyId,
      estimateId,
      estimatePoints,
    }: {
      storyId: string;
      estimateId: ID | null;
      estimatePoints: number | null;
    }) =>
      storyService.updateStoryEstimate(
        workspaceSlug,
        projectId,
        storyId,
        estimateId,
        estimatePoints,
      ),
    ...optimisticById(
      queryClient,
      ["workspaces", workspaceSlug],
      (v: { storyId: string; estimateId: ID | null; estimatePoints: number | null }) => v.storyId,
      (v) => ({ estimate_id: v.estimateId, estimate_points: v.estimatePoints }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

export function useProjectStories(
  workspaceSlug: string,
  projectId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.projectStories(workspaceSlug, projectId),
    queryFn: () => storyService.getAllProjectStories(workspaceSlug, projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useProjectStoriesPage(
  workspaceSlug: string,
  projectId: string,
  filters: IStoryFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.projectStoriesPage(workspaceSlug, projectId, filters),
    queryFn: () => storyService.getProjectStories(workspaceSlug, projectId, filters),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useStory(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.story(workspaceSlug, projectId, storyId),
    queryFn: () => storyService.getStory(workspaceSlug, projectId, storyId),
    enabled: Boolean(projectId && storyId),
  });
}

export function useWorkspaceStoriesPage(
  workspaceSlug: string,
  filters: IWorkspaceStoryFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.workspaceStories(workspaceSlug, filters),
    queryFn: () => storyService.getWorkspaceStories(workspaceSlug, filters),
    enabled,
  });
}

export function useMyStories(workspaceSlug: string, filters: IMyStoriesFilters = {}) {
  return useQuery({
    queryKey: queryKeys.myStories(workspaceSlug, filters),
    queryFn: () => storyService.getMyStories(workspaceSlug, filters),
  });
}

export function useCycleStories(
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
    queryFn: () => storyService.getCycleStories(workspaceSlug, projectId, cycleId),
    enabled: Boolean(cycleId) && enabled,
  });
}

export function useModuleStories(
  workspaceSlug: string,
  projectId: string,
  moduleId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.moduleStories(workspaceSlug, projectId, moduleId),
    queryFn: () => storyService.getModuleStories(workspaceSlug, projectId, moduleId),
    enabled: Boolean(moduleId) && enabled,
  });
}

export function useCreateStory(
  workspaceSlug: string,
  projectId: string,
  cycleId?: string,
  moduleId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateStoryPayload) =>
      storyService.createStory(workspaceSlug, projectId, {
        ...payload,
        cycle_id: payload.cycle_id ?? cycleId ?? null,
        module_id: payload.module_id ?? moduleId ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      if (moduleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.moduleStories(workspaceSlug, projectId, moduleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.module(workspaceSlug, projectId, moduleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.modules(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

/** Prefill for the duplicate-and-edit form (GIN-355). Fetched only while open. */
export function useClonePreview(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      "workspaces", workspaceSlug, "projects", projectId, "stories", storyId, "clone-preview",
    ],
    queryFn: () => storyService.clonePreview(workspaceSlug, projectId, storyId),
    enabled,
  });
}

/** Create an independent duplicate of a work item (GIN-355). Invalidates the same
 * caches a create does so every board/list/table surface refreshes. */
export function useCloneStory(workspaceSlug: string, destProjectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICloneStoryPayload) =>
      storyService.cloneStory(workspaceSlug, destProjectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, destProjectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", destProjectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}

/** Drag-to-reorder: optimistically writes `order` (+ any cross-group field patch) into the cache. */
export function useReorderStory(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, patch }: { storyId: string; patch: { order: number } & Partial<IUpdateStoryPayload> }) =>
      storyService.updateStory(workspaceSlug, projectId, storyId, patch),
    onMutate: async ({ storyId, patch }) => {
      const key = cycleId
        ? queryKeys.cycleStories(workspaceSlug, projectId, cycleId)
        : queryKeys.projectStories(workspaceSlug, projectId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<IStory[]>(key);
      if (previous) {
        queryClient.setQueryData<IStory[]>(
          key,
          applyReorder(previous, storyId, patch as Partial<IStory> & { order: number }),
        );
      }
      return { key, previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectStories(workspaceSlug, projectId) });
      if (cycleId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId) });
      }
    },
  });
}

export function useSubStories(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.subStories(workspaceSlug, projectId, storyId),
    queryFn: () => storyService.getSubStories(workspaceSlug, projectId, storyId),
    enabled: Boolean(projectId && storyId),
  });
}

export function useDeleteStory(workspaceSlug: string, projectId: string, cycleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, cascade }: { storyId: string; cascade?: EDeleteCascade }) =>
      storyService.deleteStory(workspaceSlug, projectId, storyId, cascade),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.sprintZeroStories(workspaceSlug, projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "notifications"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "my-stories"] });
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] });
      if (cycleId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.cycle(workspaceSlug, projectId, cycleId),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles(workspaceSlug, projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}
