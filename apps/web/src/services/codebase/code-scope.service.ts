import type { ICodeScope, IEffectiveScope, ISaveCodeScopePayload } from "@/types";

import { APIService } from "../api.service";

class CodeScopeService extends APIService {
  private base(slug: string, projectId: string, storyId: string) {
    return `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/code-scope`;
  }

  /** The saved scope, or a bundle-derived draft default (id null). */
  getCodeScope(slug: string, projectId: string, storyId: string) {
    return this.get<ICodeScope>(`${this.base(slug, projectId, storyId)}/`);
  }

  saveCodeScope(slug: string, projectId: string, storyId: string, payload: ISaveCodeScopePayload) {
    return this.put<ICodeScope>(`${this.base(slug, projectId, storyId)}/`, payload);
  }

  confirmCodeScope(slug: string, projectId: string, storyId: string) {
    return this.post<ICodeScope>(`${this.base(slug, projectId, storyId)}/confirm/`);
  }

  resetCodeScope(slug: string, projectId: string, storyId: string) {
    return this.post<ICodeScope>(`${this.base(slug, projectId, storyId)}/reset/`);
  }

  /** Resolved execution plan — only when Confirmed (409 otherwise). */
  getEffectiveScope(slug: string, projectId: string, storyId: string) {
    return this.get<IEffectiveScope>(`${this.base(slug, projectId, storyId)}/effective/`);
  }
}

export const codeScopeService = new CodeScopeService();
