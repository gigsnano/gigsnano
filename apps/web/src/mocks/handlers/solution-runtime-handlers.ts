import { APIError } from "@/services/api-error";
import {
  cancelJob,
  decideInference,
  planRetry,
} from "@/lib/solutions/analysis";
import {
  applyStatus,
  assertSameWorkspace,
  beginDelete,
  finishDelete,
  revokeConnection,
  sanitizeConnectionForClient,
  validateCallbackState,
} from "@/lib/solutions/connections";
import { EInferenceDecision, type IApproveInferencePayload, type IStartAnalysisPayload } from "@/types/solution/analysis";
import {
  EConnectionStatus,
  type IConnectionCallbackPayload,
  type ICreateConnectionRequestPayload,
} from "@/types/solution/connection";

import {
  analysisJobs,
  connectionCallbackIds,
  connectionRequests,
  connections,
  makeAnalysisJob,
  makeConnectionRequest,
  tickAnalysisJob,
} from "../data/solution-runtime";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Analysis jobs (GIN-448) + connection lifecycle (GIN-456) mock handlers.
 */
export function makeSolutionRuntimeHandlers(
  getCurrentUserId: () => string | null,
): Handler[] {
  const requireUser = () => {
    const userId = getCurrentUserId();
    if (!userId) throw new APIError(401, "Not authenticated");
    return userId;
  };

  return [
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/analysis-jobs\/$/,
      resolve: ([, slug], body) => {
        requireUser();
        const payload = (body ?? {}) as IStartAnalysisPayload;
        if (!payload.setup_draft_id) {
          throw new APIError(422, "setup_draft_id is required");
        }
        return clone(makeAnalysisJob(slug, payload));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/analysis-jobs\/([^/]+)\/$/,
      resolve: ([, slug, jobId]) => {
        requireUser();
        const job = analysisJobs.find((j) => j.id === jobId && j.workspace_slug === slug);
        if (!job) throw new APIError(404, "Analysis job not found");
        // Polling advances the mock so the UI can show progress without a worker.
        return clone(tickAnalysisJob(job));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/analysis-jobs\/([^/]+)\/retry\/$/,
      resolve: ([, slug, jobId]) => {
        requireUser();
        const idx = analysisJobs.findIndex((j) => j.id === jobId && j.workspace_slug === slug);
        if (idx < 0) throw new APIError(404, "Analysis job not found");
        try {
          analysisJobs[idx] = planRetry(analysisJobs[idx]!);
        } catch (error) {
          throw new APIError(422, (error as Error).message);
        }
        return clone(analysisJobs[idx]);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/analysis-jobs\/([^/]+)\/cancel\/$/,
      resolve: ([, slug, jobId]) => {
        requireUser();
        const idx = analysisJobs.findIndex((j) => j.id === jobId && j.workspace_slug === slug);
        if (idx < 0) throw new APIError(404, "Analysis job not found");
        try {
          analysisJobs[idx] = cancelJob(analysisJobs[idx]!);
        } catch (error) {
          throw new APIError(422, (error as Error).message);
        }
        return clone(analysisJobs[idx]);
      },
    },
    {
      method: "POST",
      pattern:
        /^\/workspaces\/([^/]+)\/analysis-jobs\/([^/]+)\/inferences\/([^/]+)\/decide\/$/,
      resolve: ([, slug, jobId, fieldKey], body) => {
        const userId = requireUser();
        const idx = analysisJobs.findIndex((j) => j.id === jobId && j.workspace_slug === slug);
        if (idx < 0) throw new APIError(404, "Analysis job not found");
        const payload = (body ?? {}) as IApproveInferencePayload;
        if (
          payload.decision !== EInferenceDecision.Approved &&
          payload.decision !== EInferenceDecision.Rejected
        ) {
          throw new APIError(422, "decision must be approved or rejected");
        }
        try {
          analysisJobs[idx] = decideInference(
            analysisJobs[idx]!,
            fieldKey,
            payload.decision,
            userId,
          );
        } catch (error) {
          throw new APIError(422, (error as Error).message);
        }
        return clone(analysisJobs[idx]);
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/setup-connections\/$/,
      resolve: ([, slug]) => {
        requireUser();
        return clone(
          connections
            .filter((c) => c.workspace_slug === slug && c.status !== EConnectionStatus.Deleted)
            .map((c) => sanitizeConnectionForClient({ ...c })),
        );
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/setup-connections\/request\/$/,
      resolve: ([, slug], body) => {
        const userId = requireUser();
        const payload = (body ?? {}) as ICreateConnectionRequestPayload;
        if (!payload.connector_key || !payload.requested_capabilities?.length) {
          throw new APIError(422, "connector_key and requested_capabilities are required");
        }
        return clone(makeConnectionRequest(slug, userId, payload));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/setup-connections\/([^/]+)\/$/,
      resolve: ([, slug, connectionId]) => {
        requireUser();
        const conn = connections.find((c) => c.id === connectionId && c.workspace_slug === slug);
        if (!conn) throw new APIError(404, "Connection not found");
        assertSameWorkspace(conn, slug);
        return clone(sanitizeConnectionForClient({ ...conn }));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/setup-connections\/([^/]+)\/callback\/$/,
      resolve: ([, slug, connectionId], body) => {
        requireUser();
        const payload = (body ?? {}) as IConnectionCallbackPayload;
        if (!payload.state || !payload.idempotency_key) {
          throw new APIError(422, "state and idempotency_key are required");
        }
        const existingId = connectionCallbackIds.get(payload.idempotency_key);
        if (existingId) {
          const existing = connections.find((c) => c.id === existingId);
          if (existing) return clone(sanitizeConnectionForClient({ ...existing }));
        }
        const connIdx = connections.findIndex(
          (c) => c.id === connectionId && c.workspace_slug === slug,
        );
        if (connIdx < 0) throw new APIError(404, "Connection not found");
        const request = connectionRequests.find(
          (r) =>
            r.workspace_slug === slug &&
            r.connector_key === connections[connIdx]!.connector_key &&
            r.status === EConnectionStatus.Authorizing,
        );
        if (!request) throw new APIError(422, "No authorizing request for this connection");
        try {
          validateCallbackState(request, payload.state);
        } catch (error) {
          throw new APIError(403, (error as Error).message);
        }
        // Tenant mix-up: if the connection already has a tenant, callback must match.
        const current = connections[connIdx]!;
        if (
          current.provider_tenant &&
          payload.provider_tenant &&
          current.provider_tenant !== payload.provider_tenant
        ) {
          throw new APIError(403, "Provider tenant mismatch — possible callback mix-up.");
        }
        connections[connIdx] = applyStatus(current, EConnectionStatus.Connected, {
          auth_ref: `sm://${current.connector_key}/${current.id}`,
          provider_account: payload.provider_account ?? "mock-account",
          provider_tenant: payload.provider_tenant ?? "mock-tenant",
        });
        request.status = EConnectionStatus.Connected;
        connectionCallbackIds.set(payload.idempotency_key, connections[connIdx]!.id);
        return clone(sanitizeConnectionForClient({ ...connections[connIdx]! }));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/setup-connections\/([^/]+)\/revoke\/$/,
      resolve: ([, slug, connectionId]) => {
        requireUser();
        const idx = connections.findIndex((c) => c.id === connectionId && c.workspace_slug === slug);
        if (idx < 0) throw new APIError(404, "Connection not found");
        try {
          connections[idx] = revokeConnection(connections[idx]!);
        } catch (error) {
          throw new APIError(422, (error as Error).message);
        }
        return clone(sanitizeConnectionForClient({ ...connections[idx]! }));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/setup-connections\/([^/]+)\/delete\/$/,
      resolve: ([, slug, connectionId]) => {
        requireUser();
        const idx = connections.findIndex((c) => c.id === connectionId && c.workspace_slug === slug);
        if (idx < 0) throw new APIError(404, "Connection not found");
        try {
          let next = beginDelete(connections[idx]!);
          next = finishDelete(next);
          connections[idx] = next;
        } catch (error) {
          throw new APIError(422, (error as Error).message);
        }
        return clone(sanitizeConnectionForClient({ ...connections[idx]! }));
      },
    },
  ];
}
