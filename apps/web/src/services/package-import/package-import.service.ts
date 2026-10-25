import type {
  IApplyResult,
  IDocumentPackage,
  IImportPlan,
  IPackageAnalysis,
  IPackageDocument,
  IPackageFinding,
  IUpdateFindingPayload,
  IUpdatePackageDocumentPayload,
  IUploadPackagePayload,
  IRollbackResult,
} from "@/types";

import { APIService } from "../api.service";

class PackageImportService extends APIService {
  private base(workspaceSlug: string, projectId: string) {
    return `/workspaces/${workspaceSlug}/projects/${projectId}/packages`;
  }

  uploadPackage(workspaceSlug: string, projectId: string, payload: IUploadPackagePayload) {
    return this.post<IDocumentPackage>(`${this.base(workspaceSlug, projectId)}/`, payload);
  }

  getPackage(workspaceSlug: string, projectId: string, packageId: string) {
    return this.get<IDocumentPackage>(`${this.base(workspaceSlug, projectId)}/${packageId}/`);
  }

  /** Omit `documentId` only for tiny packages: a whole package is unbounded
   *  model work behind one request and exceeds the gateway timeout. */
  analysePackage(
    workspaceSlug: string,
    projectId: string,
    packageId: string,
    documentId?: string,
  ) {
    const base = `${this.base(workspaceSlug, projectId)}/${packageId}/analyse/`;
    return this.post<IPackageAnalysis>(
      documentId ? `${base}?document_id=${encodeURIComponent(documentId)}` : base,
      {},
    );
  }

  getFindings(workspaceSlug: string, projectId: string, packageId: string) {
    return this.get<IPackageAnalysis>(
      `${this.base(workspaceSlug, projectId)}/${packageId}/findings/`,
    );
  }

  updateDocument(
    workspaceSlug: string,
    projectId: string,
    packageId: string,
    documentId: string,
    payload: IUpdatePackageDocumentPayload,
  ) {
    return this.patch<IPackageDocument>(
      `${this.base(workspaceSlug, projectId)}/${packageId}/documents/${documentId}/`,
      payload,
    );
  }

  updateFinding(
    workspaceSlug: string,
    projectId: string,
    packageId: string,
    findingId: string,
    payload: IUpdateFindingPayload,
  ) {
    return this.patch<IPackageFinding>(
      `${this.base(workspaceSlug, projectId)}/${packageId}/findings/${findingId}/`,
      payload,
    );
  }
  buildPlan(workspaceSlug: string, projectId: string, packageId: string, strategy: string) {
    return this.post<IImportPlan>(
      `${this.base(workspaceSlug, projectId)}/${packageId}/plan/`,
      { strategy },
    );
  }

  getPlan(workspaceSlug: string, projectId: string, packageId: string) {
    return this.get<IImportPlan>(`${this.base(workspaceSlug, projectId)}/${packageId}/plan/`);
  }

  decideChanges(
    workspaceSlug: string,
    projectId: string,
    packageId: string,
    decision: string,
    changeIds?: string[],
  ) {
    return this.post<IImportPlan>(
      `${this.base(workspaceSlug, projectId)}/${packageId}/plan/decide/`,
      changeIds ? { decision, change_ids: changeIds } : { decision },
    );
  }

  applyPlan(workspaceSlug: string, projectId: string, packageId: string) {
    return this.post<IApplyResult>(
      `${this.base(workspaceSlug, projectId)}/${packageId}/plan/apply/`,
      {},
    );
  }

  rollbackPlan(workspaceSlug: string, projectId: string, packageId: string) {
    return this.post<IRollbackResult>(
      `${this.base(workspaceSlug, projectId)}/${packageId}/plan/rollback/`,
      {},
    );
  }
}

export const packageImportService = new PackageImportService();
