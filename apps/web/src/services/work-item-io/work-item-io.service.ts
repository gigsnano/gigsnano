import type {
  IExportJob,
  IImportJob,
  IWorkItemExportRequest,
  IWorkItemImportPreview,
} from "@/types";

import { apiUrl } from "@/lib/download/trigger-download";
import { APIService } from "../api.service";

class WorkItemIoService extends APIService {
  private base(ws: string, pid: string) {
    return `/workspaces/${ws}/projects/${pid}/work-items`;
  }

  createExport(ws: string, pid: string, req: IWorkItemExportRequest) {
    return this.post<IExportJob>(`${this.base(ws, pid)}/export/`, req);
  }

  validateImport(ws: string, pid: string, file: File, format: "xlsx" | "csv") {
    const form = new FormData();
    form.append("file", file);
    form.append("format", format);
    return this.postForm<IWorkItemImportPreview>(
      `${this.base(ws, pid)}/import/validate/`,
      form,
    );
  }

  createImport(ws: string, pid: string, file: File, format: "xlsx" | "csv") {
    const form = new FormData();
    form.append("file", file);
    form.append("format", format);
    return this.postForm<IImportJob>(`${this.base(ws, pid)}/import/`, form);
  }

  getImportJob(ws: string, pid: string, id: string) {
    return this.get<IImportJob>(`${this.base(ws, pid)}/import/${id}/`);
  }

  getExportJob(ws: string, pid: string, id: string) {
    return this.get<IExportJob>(`${this.base(ws, pid)}/export/${id}/`);
  }

  templateUrl(ws: string, pid: string) {
    return apiUrl(`${this.base(ws, pid)}/export/template/`);
  }

  downloadUrl(relative: string) {
    return apiUrl(relative);
  }
}

export const workItemIoService = new WorkItemIoService();
