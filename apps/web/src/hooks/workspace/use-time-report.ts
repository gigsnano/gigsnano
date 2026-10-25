import { useQuery } from "@tanstack/react-query";

import { timeTrackingService } from "@/services/workspace/time-tracking.service";
import type { ITimeReportFilters } from "@/types";

import { queryKeys } from "../query-keys";

export function useWorkspaceTimeEntries(
  workspaceSlug: string,
  filters: ITimeReportFilters = {},
) {
  return useQuery({
    queryKey: queryKeys.workspaceTimeEntries(workspaceSlug, filters),
    queryFn: () => timeTrackingService.getWorkspaceTimeEntries(workspaceSlug, filters),
  });
}
