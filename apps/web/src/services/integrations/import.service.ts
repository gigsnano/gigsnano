import type {
  ICreateGitHubImportPayload,
  ICreateImportPayload,
  IGitHubImportPreview,
  IImportFilters,
  IImportJob,
  IImportJobPage,
} from "@/types";

import { appendOffsetPageParams } from "@/lib/pagination/offset-query";
import { APIService } from "../api.service";

class ImportService extends APIService {
  getImports(workspaceSlug: string, filters: IImportFilters = {}) {
    const qs = new URLSearchParams();
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IImportJobPage>(`/workspaces/${workspaceSlug}/imports/${suffix}`);
  }

  createImport(workspaceSlug: string, payload: ICreateImportPayload) {
    const form = new FormData();
    form.append("file", payload.file);
    form.append("format", payload.format);
    return this.postForm<IImportJob>(`/workspaces/${workspaceSlug}/imports/`, form);
  }

  previewGitHubImport(workspaceSlug: string, owner: string, repo: string) {
    const qs = new URLSearchParams({ owner, repo });
    return this.get<IGitHubImportPreview>(
      `/workspaces/${workspaceSlug}/imports/github/preview/?${qs.toString()}`,
    );
  }

  createGitHubImport(workspaceSlug: string, payload: ICreateGitHubImportPayload) {
    return this.post<IImportJob>(`/workspaces/${workspaceSlug}/imports/github/`, payload);
  }
}

export const importService = new ImportService();
