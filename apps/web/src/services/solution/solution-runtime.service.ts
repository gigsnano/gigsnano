import type {
  IAnalysisJob,
  IApproveInferencePayload,
  IStartAnalysisPayload,
} from "@/types/solution/analysis";
import type {
  IConnection,
  IConnectionCallbackPayload,
  IConnectionRequest,
  ICreateConnectionRequestPayload,
} from "@/types/solution/connection";

import { APIService } from "../api.service";

class SolutionRuntimeService extends APIService {
  startAnalysis(workspaceSlug: string, payload: IStartAnalysisPayload) {
    return this.post<IAnalysisJob>(`/workspaces/${workspaceSlug}/analysis-jobs/`, payload);
  }

  getAnalysisJob(workspaceSlug: string, jobId: string) {
    return this.get<IAnalysisJob>(`/workspaces/${workspaceSlug}/analysis-jobs/${jobId}/`);
  }

  retryAnalysis(workspaceSlug: string, jobId: string) {
    return this.post<IAnalysisJob>(
      `/workspaces/${workspaceSlug}/analysis-jobs/${jobId}/retry/`,
      {},
    );
  }

  cancelAnalysis(workspaceSlug: string, jobId: string) {
    return this.post<IAnalysisJob>(
      `/workspaces/${workspaceSlug}/analysis-jobs/${jobId}/cancel/`,
      {},
    );
  }

  decideInference(
    workspaceSlug: string,
    jobId: string,
    fieldKey: string,
    payload: IApproveInferencePayload,
  ) {
    return this.post<IAnalysisJob>(
      `/workspaces/${workspaceSlug}/analysis-jobs/${jobId}/inferences/${fieldKey}/decide/`,
      payload,
    );
  }

  listConnections(workspaceSlug: string) {
    return this.get<IConnection[]>(`/workspaces/${workspaceSlug}/setup-connections/`);
  }

  requestConnection(workspaceSlug: string, payload: ICreateConnectionRequestPayload) {
    return this.post<IConnectionRequest>(
      `/workspaces/${workspaceSlug}/setup-connections/request/`,
      payload,
    );
  }

  getConnection(workspaceSlug: string, connectionId: string) {
    return this.get<IConnection>(`/workspaces/${workspaceSlug}/setup-connections/${connectionId}/`);
  }

  completeConnectionCallback(
    workspaceSlug: string,
    connectionId: string,
    payload: IConnectionCallbackPayload,
  ) {
    return this.post<IConnection>(
      `/workspaces/${workspaceSlug}/setup-connections/${connectionId}/callback/`,
      payload,
    );
  }

  revokeConnection(workspaceSlug: string, connectionId: string) {
    return this.post<IConnection>(
      `/workspaces/${workspaceSlug}/setup-connections/${connectionId}/revoke/`,
      {},
    );
  }

  deleteConnection(workspaceSlug: string, connectionId: string) {
    return this.post<IConnection>(
      `/workspaces/${workspaceSlug}/setup-connections/${connectionId}/delete/`,
      {},
    );
  }
}

export const solutionRuntimeService = new SolutionRuntimeService();
