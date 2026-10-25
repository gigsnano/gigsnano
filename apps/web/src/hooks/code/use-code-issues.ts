import { useQuery } from "@tanstack/react-query";

import { codeIssuesService } from "@/services/code/code-issues.service";

import { queryKeys } from "../query-keys";

/** The project's full static-analysis findings. Disabled until the index is ready
 * (callers gate on `useIndexStatus` first — a 409 here means "not indexed yet"). */
export function useCodeIssues(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.codeIssues(workspaceSlug, projectId),
    queryFn: () => codeIssuesService.getIssues(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
  });
}
