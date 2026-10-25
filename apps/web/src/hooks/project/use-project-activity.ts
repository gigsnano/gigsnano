import { useQuery } from "@tanstack/react-query";

import { projectActivityService } from "@/services/project/project-activity.service";

import { queryKeys } from "../query-keys";

/** Activity feed for a project (Overview → Activity tab), newest first. */
export function useProjectActivity(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectActivity(workspaceSlug, projectId),
    queryFn: () => projectActivityService.getActivity(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}
