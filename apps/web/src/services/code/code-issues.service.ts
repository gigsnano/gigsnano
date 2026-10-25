import type { IIssuesPayload } from "@/types";

import { APIService } from "../api.service";

class CodeIssuesService extends APIService {
  /** The project's full static-analysis findings (`issues.json`). Separate from
   * `code/metrics/`, which carries only a capped summary because that payload is
   * fed to the LLM whole. 409s when the index isn't ready. */
  getIssues(workspaceSlug: string, projectId: string) {
    return this.get<IIssuesPayload>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/issues/`,
    );
  }
}

export const codeIssuesService = new CodeIssuesService();
