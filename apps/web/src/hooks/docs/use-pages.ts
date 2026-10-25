import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { pageService } from "@/services/docs/page.service";
import type { ICreatePagePayload, IUpdatePagePayload } from "@/types";
import { useProjects } from "@/hooks/project/use-projects";
import type { IPageWithProject } from "@/types/docs/page";

import { queryKeys } from "../query-keys";

export function usePages(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.pages(workspaceSlug, projectId),
    queryFn: () => pageService.getPages(workspaceSlug, projectId),
  });
}

export function usePage(workspaceSlug: string, projectId: string, pageId: string) {
  return useQuery({
    queryKey: queryKeys.page(workspaceSlug, projectId, pageId),
    queryFn: () => pageService.getPage(workspaceSlug, projectId, pageId),
    enabled: Boolean(pageId),
  });
}

/**
 * Presence v1 (GIN-24): polling heartbeat, not a websocket. Each refetch both
 * announces "I'm here" (+ editing state) and returns the live viewer list —
 * one round trip does both jobs. `editing` is part of the query key so
 * flipping it fires an immediate heartbeat instead of waiting for the next
 * poll tick.
 * ponytail: short-poll is plenty for a soft advisory; no need for SSE/websockets here.
 */
export function usePagePresence(
  workspaceSlug: string,
  projectId: string,
  pageId: string,
  editing: boolean,
) {
  return useQuery({
    queryKey: queryKeys.pagePresence(workspaceSlug, projectId, pageId, editing),
    queryFn: () => pageService.heartbeatPresence(workspaceSlug, projectId, pageId, editing),
    enabled: Boolean(pageId),
    refetchInterval: 4000,
  });
}

export function useCreatePage(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreatePagePayload) =>
      pageService.createPage(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages(workspaceSlug, projectId) });
    },
  });
}

export function useUpdatePage(workspaceSlug: string, projectId: string, pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpdatePagePayload) =>
      pageService.updatePage(workspaceSlug, projectId, pageId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.page(workspaceSlug, projectId, pageId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pages(workspaceSlug, projectId) });
    },
  });
}

export function useDeletePage(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => pageService.deletePage(workspaceSlug, projectId, pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages(workspaceSlug, projectId) });
    },
  });
}

/**
 * All pages across the workspace's projects, each tagged with its project
 * name. Aggregates client-side over the existing per-project endpoint so no
 * new backend route is required.
 */
export function useWorkspacePages(workspaceSlug: string) {
  const projectsQuery = useProjects(workspaceSlug);
  const projects = projectsQuery.data ?? [];

  const results = useQueries({
    queries: projects.map((project) => ({
      queryKey: queryKeys.pages(workspaceSlug, project.id),
      queryFn: () => pageService.getPages(workspaceSlug, project.id),
    })),
  });

  const data: IPageWithProject[] = results.flatMap((result, i) =>
    (result.data ?? []).map((page) => ({ ...page, project_name: projects[i].name })),
  );

  return {
    data,
    isPending: projectsQuery.isPending || results.some((r) => r.isPending),
    // Pages are supplementary: only a failure to list projects is fatal. A
    // single project's page-fetch failure degrades (its pages are omitted) so
    // it never blanks the whole /docs view — the other pages and all documents
    // still render.
    isError: projectsQuery.isError,
    refetch: () => {
      projectsQuery.refetch();
      results.forEach((result) => result.refetch());
    },
  };
}
