import type {
  IBundleValidationResult,
  ICreateBundlePayload,
  ISystemBundle,
  IUpdateBundlePayload,
  IValidateBundlePayload,
} from "@/types";

import { APIService } from "../api.service";

class BundleService extends APIService {
  private base(slug: string, projectId: string) {
    return `/workspaces/${slug}/projects/${projectId}/system-bundles`;
  }

  listBundles(slug: string, projectId: string) {
    return this.get<ISystemBundle[]>(`${this.base(slug, projectId)}/`);
  }

  getBundle(slug: string, projectId: string, bundleId: string) {
    return this.get<ISystemBundle>(`${this.base(slug, projectId)}/${bundleId}/`);
  }

  createBundle(slug: string, projectId: string, payload: ICreateBundlePayload) {
    return this.post<ISystemBundle>(`${this.base(slug, projectId)}/`, payload);
  }

  /** Editing an in-use bundle creates a new immutable version server-side. */
  updateBundle(slug: string, projectId: string, bundleId: string, payload: IUpdateBundlePayload) {
    return this.patch<ISystemBundle>(`${this.base(slug, projectId)}/${bundleId}/`, payload);
  }

  /** Validate a draft config without saving. */
  validateBundle(slug: string, projectId: string, payload: IValidateBundlePayload) {
    return this.post<IBundleValidationResult>(`${this.base(slug, projectId)}/validate/`, payload);
  }

  setDefault(slug: string, projectId: string, bundleId: string) {
    return this.post<ISystemBundle>(`${this.base(slug, projectId)}/${bundleId}/default/`);
  }

  archiveBundle(slug: string, projectId: string, bundleId: string) {
    return this.delete<{ success: boolean }>(`${this.base(slug, projectId)}/${bundleId}/`);
  }
}

export const bundleService = new BundleService();
