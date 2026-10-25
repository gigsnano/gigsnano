import type { ICreateExportPayload, IExportFilters, IExportJob, IExportJobPage } from "@/types";

import { appendOffsetPageParams } from "@/lib/pagination/offset-query";
import { APIService } from "../api.service";

class ExportService extends APIService {
  getExports(workspaceSlug: string, filters: IExportFilters = {}) {
    const qs = new URLSearchParams();
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IExportJobPage>(`/workspaces/${workspaceSlug}/exports/${suffix}`);
  }

  createExport(workspaceSlug: string, payload: ICreateExportPayload) {
    return this.post<IExportJob>(`/workspaces/${workspaceSlug}/exports/`, payload);
  }
}

export const exportService = new ExportService();
