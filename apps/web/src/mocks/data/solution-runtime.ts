import {
  EAnalysisJobStatus,
  EAnalysisSourceKind,
  EAnalysisSubStatus,
  EInferenceDecision,
  type IAnalysisJob,
  type IAnalysisSourceRef,
  type IStartAnalysisPayload,
} from "@/types/solution/analysis";
import {
  EConnectionScope,
  EConnectionStatus,
  type IConnection,
  type IConnectionRequest,
  type ICreateConnectionRequestPayload,
} from "@/types/solution/connection";

import { ratioFromSubResults } from "@/lib/solutions/analysis";

/** In-memory analysis jobs for mock handlers (GIN-448). */
export const analysisJobs: IAnalysisJob[] = [];

/** In-memory connections + pending requests (GIN-456). */
export const connections: IConnection[] = [];
export const connectionRequests: IConnectionRequest[] = [];
/** Idempotency key → connection id for duplicate callbacks. */
export const connectionCallbackIds = new Map<string, string>();

let seq = 0;
const nid = (prefix: string) => `${prefix}-${++seq}-${Date.now().toString(36)}`;

export function resetSolutionRuntimeMocks() {
  analysisJobs.length = 0;
  connections.length = 0;
  connectionRequests.length = 0;
  connectionCallbackIds.clear();
  seq = 0;
}

export function makeAnalysisJob(
  workspaceSlug: string,
  payload: IStartAnalysisPayload,
): IAnalysisJob {
  const now = new Date().toISOString();
  const sources: IAnalysisSourceRef[] =
    payload.sources.length > 0
      ? payload.sources
      : [
          {
            kind: EAnalysisSourceKind.Artifact,
            ref: "draft-context",
            version: "1",
            label: "Setup draft context",
          },
        ];
  const sub_results = [
    {
      key: "ingest",
      label: "Ingest sources",
      status: EAnalysisSubStatus.Completed,
      artifact_id: nid("art"),
      error: null,
    },
    {
      key: "extract",
      label: "Extract facts",
      status: EAnalysisSubStatus.Running,
      artifact_id: null,
      error: null,
    },
    {
      key: "conflicts",
      label: "Detect conflicts",
      status: EAnalysisSubStatus.Pending,
      artifact_id: null,
      error: null,
    },
  ];
  const job: IAnalysisJob = {
    id: nid("analysis"),
    workspace_slug: workspaceSlug,
    setup_draft_id: payload.setup_draft_id,
    status: EAnalysisJobStatus.Running,
    sources,
    sub_results,
    inferences: [
      {
        field_key: "name",
        value: "Inferred project",
        confidence: 0.72,
        source: sources[0]!,
        decision: EInferenceDecision.Pending,
        decided_by: null,
        decided_at: null,
      },
      {
        field_key: "has_ui",
        value: true,
        confidence: 0.55,
        source: sources[0]!,
        decision: EInferenceDecision.Pending,
        decided_by: null,
        decided_at: null,
      },
    ],
    progress: [
      {
        at: now,
        message: "Queued analysis",
        ratio: 0,
      },
      {
        at: now,
        message: "Ingesting sources",
        ratio: 0.33,
      },
    ],
    ratio: ratioFromSubResults(sub_results),
    error: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    cancelled_at: null,
    temp_files_cleaned: false,
  };
  analysisJobs.push(job);
  return job;
}

/** Advance a running mock job one tick so polling shows progress. */
export function tickAnalysisJob(job: IAnalysisJob): IAnalysisJob {
  if (
    job.status === EAnalysisJobStatus.Completed ||
    job.status === EAnalysisJobStatus.Cancelled
  ) {
    return job;
  }
  const now = new Date().toISOString();
  const nextSubs = job.sub_results.map((sub, i) => {
    if (sub.status === EAnalysisSubStatus.Completed || sub.status === EAnalysisSubStatus.Skipped) {
      return sub;
    }
    if (sub.status === EAnalysisSubStatus.Running) {
      return {
        ...sub,
        status: EAnalysisSubStatus.Completed,
        artifact_id: sub.artifact_id ?? nid("art"),
        error: null,
      };
    }
    // Start the first pending after a running one completed.
    const prev = job.sub_results[i - 1];
    if (
      sub.status === EAnalysisSubStatus.Pending &&
      (!prev || prev.status === EAnalysisSubStatus.Completed)
    ) {
      return { ...sub, status: EAnalysisSubStatus.Running };
    }
    return sub;
  });
  const allDone = nextSubs.every(
    (s) =>
      s.status === EAnalysisSubStatus.Completed ||
      s.status === EAnalysisSubStatus.Failed ||
      s.status === EAnalysisSubStatus.Skipped,
  );
  const anyFailed = nextSubs.some((s) => s.status === EAnalysisSubStatus.Failed);
  job.sub_results = nextSubs;
  job.ratio = ratioFromSubResults(nextSubs);
  job.updated_at = now;
  job.progress = [
    ...job.progress,
    { at: now, message: allDone ? "Analysis settled" : "Extracting…", ratio: job.ratio },
  ];
  if (allDone) {
    job.status = anyFailed ? EAnalysisJobStatus.Partial : EAnalysisJobStatus.Completed;
    job.completed_at = now;
    job.temp_files_cleaned = true;
  } else {
    job.status = EAnalysisJobStatus.Running;
  }
  return job;
}

export function makeConnectionRequest(
  workspaceSlug: string,
  ownerId: string,
  payload: ICreateConnectionRequestPayload,
): IConnectionRequest {
  const now = new Date().toISOString();
  const connectionId = nid("conn");
  const request: IConnectionRequest = {
    id: nid("creq"),
    workspace_slug: workspaceSlug,
    connector_key: payload.connector_key,
    connector_version: payload.connector_version,
    scope: payload.scope ?? EConnectionScope.Workspace,
    container_id: payload.container_id ?? null,
    connection_id: connectionId,
    requested_capabilities: payload.requested_capabilities,
    state: nid("oauth-state"),
    pkce_challenge: nid("pkce"),
    status: EConnectionStatus.Authorizing,
    created_at: now,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
  connectionRequests.push(request);
  connections.push({
    id: connectionId,
    workspace_slug: workspaceSlug,
    connector_key: payload.connector_key,
    connector_version: payload.connector_version,
    status: EConnectionStatus.Authorizing,
    scope: request.scope,
    container_id: request.container_id,
    provider_account: null,
    provider_tenant: null,
    granted_capabilities: payload.requested_capabilities,
    provider_scopes: [],
    auth_ref: null,
    owner_id: ownerId,
    read_only: payload.read_only ?? true,
    recovery_hint: null,
    created_at: now,
    updated_at: now,
    connected_at: null,
    revoked_at: null,
    deleted_at: null,
  });
  return request;
}
