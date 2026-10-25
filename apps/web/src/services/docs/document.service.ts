import type {
  ICreateDocumentPayload,
  IDocument,
  IDocumentComment,
  IUpdateDocumentPayload,
  IUploadStoryDocumentPayload,
} from "@/types";

import { APIService } from "../api.service";

export interface IAddDocumentCommentPayload {
  block_index: number;
  body: string;
  assignee?: string | null;
}

class DocumentService extends APIService {
  getDocuments(workspaceSlug: string) {
    return this.get<IDocument[]>(`/workspaces/${workspaceSlug}/documents/`);
  }

  getStoryDocuments(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IDocument[]>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/documents/`,
    );
  }

  getDocument(workspaceSlug: string, documentId: string) {
    return this.get<IDocument>(`/workspaces/${workspaceSlug}/documents/${documentId}/`);
  }

  createDocument(workspaceSlug: string, payload: ICreateDocumentPayload) {
    return this.post<IDocument>(`/workspaces/${workspaceSlug}/documents/`, payload);
  }

  uploadStoryDocument(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: IUploadStoryDocumentPayload,
  ) {
    return this.post<IDocument>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/documents/`,
      payload,
    );
  }

  updateDocument(workspaceSlug: string, documentId: string, payload: IUpdateDocumentPayload) {
    return this.patch<IDocument>(
      `/workspaces/${workspaceSlug}/documents/${documentId}/`,
      payload,
    );
  }

  deleteDocument(workspaceSlug: string, documentId: string) {
    return this.delete<{ success: boolean }>(
      `/workspaces/${workspaceSlug}/documents/${documentId}/`,
    );
  }

  addComment(workspaceSlug: string, documentId: string, payload: IAddDocumentCommentPayload) {
    return this.post<IDocumentComment>(
      `/workspaces/${workspaceSlug}/documents/${documentId}/comments/`,
      payload,
    );
  }

  resolveComment(
    workspaceSlug: string,
    documentId: string,
    commentId: string,
    resolved: boolean,
  ) {
    return this.patch<IDocumentComment>(
      `/workspaces/${workspaceSlug}/documents/${documentId}/comments/${commentId}/`,
      { resolved },
    );
  }
}

export const documentService = new DocumentService();
