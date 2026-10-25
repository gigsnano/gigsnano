import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { documentService } from "@/services/docs/document.service";
import type { IAddDocumentCommentPayload } from "@/services/docs/document.service";
import type { ICreateDocumentPayload, IUploadStoryDocumentPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useDocuments(workspaceSlug: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.documents(workspaceSlug),
    queryFn: () => documentService.getDocuments(workspaceSlug),
    enabled: Boolean(workspaceSlug) && enabled,
  });
}

export function useDocument(workspaceSlug: string, documentId: string) {
  return useQuery({
    queryKey: queryKeys.document(workspaceSlug, documentId),
    queryFn: () => documentService.getDocument(workspaceSlug, documentId),
    enabled: Boolean(documentId),
  });
}

export function useCreateDocument(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateDocumentPayload) =>
      documentService.createDocument(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
    },
  });
}

export function useAddDocumentComment(workspaceSlug: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IAddDocumentCommentPayload) =>
      documentService.addComment(workspaceSlug, documentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.document(workspaceSlug, documentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
    },
  });
}

export function useResolveDocumentComment(workspaceSlug: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      documentService.resolveComment(workspaceSlug, documentId, commentId, resolved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.document(workspaceSlug, documentId) });
    },
  });
}

export function useUpdateDocument(workspaceSlug: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: import("@/types").IUpdateDocumentPayload) =>
      documentService.updateDocument(workspaceSlug, documentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.document(workspaceSlug, documentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
    },
  });
}

export function useStoryDocuments(workspaceSlug: string, projectId: string, storyId: string) {
  return useQuery({
    queryKey: queryKeys.storyDocuments(workspaceSlug, projectId, storyId),
    queryFn: () => documentService.getStoryDocuments(workspaceSlug, projectId, storyId),
    enabled: Boolean(storyId),
  });
}

/**
 * All documents in a project (agent-generated artifacts + user uploads), derived
 * from the live workspace-documents list. Used by the story chat's reference panel
 * + @-mention picker so a BMAD doc produced in one step (brief, research, PRD…)
 * can be tagged from any other task's chat — not just the task that produced it.
 */
export function useProjectDocuments(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.documents(workspaceSlug),
    queryFn: () => documentService.getDocuments(workspaceSlug),
    enabled: Boolean(workspaceSlug) && enabled,
    select: (docs) => docs.filter((d) => d.project_id === projectId),
  });
}

export function useUploadStoryDocument(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUploadStoryDocumentPayload) =>
      documentService.uploadStoryDocument(workspaceSlug, projectId, storyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.storyDocuments(workspaceSlug, projectId, storyId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
    },
  });
}

/**
 * Upload a document to a story whose id is only known at mutation time — used
 * when attaching documents during work-item creation (GIN-79), where the story
 * doesn't exist until the create call returns. Unlike `useUploadStoryDocument`,
 * the target story id travels with each mutation instead of being bound up front.
 */
export function useUploadStoryDocuments(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, payload }: { storyId: string; payload: IUploadStoryDocumentPayload }) =>
      documentService.uploadStoryDocument(workspaceSlug, projectId, storyId, payload),
    onSuccess: (_data, { storyId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.storyDocuments(workspaceSlug, projectId, storyId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
    },
  });
}

export function useDeleteDocument(workspaceSlug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => documentService.deleteDocument(workspaceSlug, documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.storyDocuments(workspaceSlug, projectId, storyId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(workspaceSlug) });
    },
  });
}
