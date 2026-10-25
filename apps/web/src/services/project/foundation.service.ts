import { APIService } from "@/services/api.service";
import type {
  IArtifact,
  IFoundation,
  ILockFoundationPayload,
  IStackDetection,
  IValidateDiffPayload,
  IValidationResult,
} from "@/types/project/foundation";

class FoundationService extends APIService {
  getFoundation(workspaceSlug: string, projectId: string) {
    return this.get<IFoundation | null>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/`,
    );
  }

  lockFoundation(workspaceSlug: string, projectId: string, payload: ILockFoundationPayload) {
    return this.post<IFoundation>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/lock/`,
      payload,
    );
  }

  validateDiff(workspaceSlug: string, projectId: string, payload: IValidateDiffPayload) {
    return this.post<IValidationResult>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/validate/`,
      payload,
    );
  }

  detectStack(workspaceSlug: string, projectId: string) {
    return this.get<IStackDetection>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/detect/`,
    );
  }

  proposeChange(workspaceSlug: string, projectId: string, payload: ILockFoundationPayload) {
    return this.post<IFoundation>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/propose/`,
      payload,
    );
  }

  approveChange(workspaceSlug: string, projectId: string) {
    return this.post<IFoundation>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/propose/approve/`,
      {},
    );
  }

  rejectChange(workspaceSlug: string, projectId: string) {
    return this.post<IFoundation>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/propose/reject/`,
      {},
    );
  }

  listArtifacts(workspaceSlug: string) {
    return this.get<IArtifact[]>(`/workspaces/${workspaceSlug}/artifacts/`);
  }

  setPins(workspaceSlug: string, projectId: string, pinned: string[]) {
    return this.put<IFoundation>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/foundation/pins/`,
      { pinned_artifacts: pinned },
    );
  }
}

export const foundationService = new FoundationService();
