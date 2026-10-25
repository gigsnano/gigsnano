import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";

import { workItemIoService } from "@/services/work-item-io/work-item-io.service";
import { EExportStatus, EImportStatus } from "@/types";
import type { IWorkItemExportRequest } from "@/types";

import { queryKeys } from "../query-keys";

const PENDING = new Set([EImportStatus.Queued, EImportStatus.Parsing, EImportStatus.Importing]);

/**
 * Invalidate the same story-cache key set `useCreateStory` invalidates on a
 * single-story create. Shared by anything that creates/mutates stories in
 * bulk outside that hook — currently the import wizard, which must invalidate
 * on the *terminal* poll state (job actually finished), not on job creation.
 */
export function invalidateProjectStories(queryClient: QueryClient, ws: string, pid: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.sprintZeroStories(ws, pid) });
  queryClient.invalidateQueries({ queryKey: queryKeys.project(ws, pid) });
  queryClient.invalidateQueries({ queryKey: queryKeys.projects(ws) });
  queryClient.invalidateQueries({ queryKey: queryKeys.documents(ws) });
  queryClient.invalidateQueries({ queryKey: ["workspaces", ws, "notifications"] });
  queryClient.invalidateQueries({ queryKey: queryKeys.notificationUnread(ws) });
  queryClient.invalidateQueries({ queryKey: ["workspaces", ws, "my-stories"] });
  queryClient.invalidateQueries({
    queryKey: ["workspaces", ws, "projects", pid, "stories"],
  });
  queryClient.invalidateQueries({ queryKey: ["workspaces", ws, "stories"] });
  queryClient.invalidateQueries({ queryKey: queryKeys.analytics(ws) });
}

export function useValidateWorkItemImport(ws: string, pid: string) {
  return useMutation({
    mutationFn: ({ file, format }: { file: File; format: "xlsx" | "csv" }) =>
      workItemIoService.validateImport(ws, pid, file, format),
  });
}

// Verified false positive: this mutation only resolves with the QUEUED job, before the backend
// BackgroundTask has created any stories, so invalidating here would refetch pre-import data.
// Invalidation instead happens via the shared `invalidateProjectStories` helper above, driven by
// the *polled* job (`useImportJob`) reaching a terminal state in `import-dialog.tsx` — a
// global/external handler this static per-mutation rule can't see.
export function useCreateWorkItemImport(ws: string, pid: string) {
  // eslint-disable-next-line react-doctor/query-mutation-missing-invalidation -- see comment above
  return useMutation({
    mutationFn: ({ file, format }: { file: File; format: "xlsx" | "csv" }) =>
      workItemIoService.createImport(ws, pid, file, format),
  });
}

export function useCreateWorkItemExport(ws: string, pid: string) {
  return useMutation({
    mutationFn: (req: IWorkItemExportRequest) => workItemIoService.createExport(ws, pid, req),
  });
}

export function useImportJob(ws: string, pid: string, id: string | null) {
  return useQuery({
    queryKey: queryKeys.workItemImportJob(ws, pid, id ?? ""),
    enabled: !!id,
    queryFn: () => workItemIoService.getImportJob(ws, pid, id!),
    refetchInterval: (query) =>
      query.state.data && PENDING.has(query.state.data.status) ? 1500 : false,
  });
}

export function useExportJob(ws: string, pid: string, id: string | null) {
  return useQuery({
    queryKey: queryKeys.workItemExportJob(ws, pid, id ?? ""),
    enabled: !!id,
    queryFn: () => workItemIoService.getExportJob(ws, pid, id!),
    refetchInterval: (query) =>
      query.state.data && query.state.data.status === EExportStatus.Pending ? 1500 : false,
  });
}
