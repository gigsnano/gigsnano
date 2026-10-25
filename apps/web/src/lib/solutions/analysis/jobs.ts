import {
  ANALYSIS_UPLOAD_LIMITS,
  EAnalysisJobStatus,
  EAnalysisSubStatus,
  EInferenceDecision,
  type IAnalysisJob,
  type IAnalysisSubResult,
  type IInferredField,
  type IUploadValidationResult,
} from "@/types/solution/analysis";

const TERMINAL: ReadonlySet<EAnalysisJobStatus> = new Set([
  EAnalysisJobStatus.Completed,
  EAnalysisJobStatus.Cancelled,
  EAnalysisJobStatus.Failed,
]);

export function isTerminalJob(status: EAnalysisJobStatus): boolean {
  return TERMINAL.has(status);
}

/** Malware/type/size gate before any processing. */
export function validateUpload(file: {
  name: string;
  size: number;
  type: string;
}): IUploadValidationResult {
  const errors: string[] = [];
  if (file.size <= 0) errors.push("File is empty.");
  if (file.size > ANALYSIS_UPLOAD_LIMITS.max_bytes) {
    errors.push(
      `File exceeds the ${Math.round(ANALYSIS_UPLOAD_LIMITS.max_bytes / (1024 * 1024))} MB limit.`,
    );
  }
  const mime = file.type || "application/octet-stream";
  if (
    !ANALYSIS_UPLOAD_LIMITS.allowed_mime.includes(
      mime as (typeof ANALYSIS_UPLOAD_LIMITS.allowed_mime)[number],
    )
  ) {
    errors.push(`File type "${mime}" is not allowed.`);
  }
  // Obvious executable extensions — the real malware scan is server-side.
  if (/\.(exe|bat|cmd|ps1|dll|scr|js|msi)$/i.test(file.name)) {
    errors.push("Executable uploads are not allowed.");
  }
  return { ok: errors.length === 0, errors };
}

export function ratioFromSubResults(subs: IAnalysisSubResult[]): number {
  if (subs.length === 0) return 0;
  const done = subs.filter(
    (s) =>
      s.status === EAnalysisSubStatus.Completed ||
      s.status === EAnalysisSubStatus.Failed ||
      s.status === EAnalysisSubStatus.Skipped,
  ).length;
  return done / subs.length;
}

/**
 * Retry a failed/partial job. Completed sub-results (and their artifact ids)
 * are kept — nothing is duplicated.
 */
export function planRetry(job: IAnalysisJob): IAnalysisJob {
  if (job.status === EAnalysisJobStatus.Cancelled) {
    throw new Error("Cancelled analysis cannot be retried — start a new job.");
  }
  const sub_results = job.sub_results.map((sub) => {
    if (sub.status === EAnalysisSubStatus.Completed) return sub;
    return {
      ...sub,
      status: EAnalysisSubStatus.Pending,
      error: null,
      artifact_id: null,
    };
  });
  return {
    ...job,
    status: EAnalysisJobStatus.Queued,
    error: null,
    sub_results,
    ratio: ratioFromSubResults(sub_results),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };
}

/**
 * Approve or reject an inference. Approved values are sticky — a later source
 * update marks them stale rather than overwriting.
 */
export function decideInference(
  job: IAnalysisJob,
  fieldKey: string,
  decision: EInferenceDecision.Approved | EInferenceDecision.Rejected,
  actorId: string,
): IAnalysisJob {
  const inferences = job.inferences.map((inf) => {
    if (inf.field_key !== fieldKey) return inf;
    return {
      ...inf,
      decision,
      decided_by: actorId,
      decided_at: new Date().toISOString(),
    };
  });
  if (!job.inferences.some((i) => i.field_key === fieldKey)) {
    throw new Error(`Unknown inferred field "${fieldKey}".`);
  }
  return { ...job, inferences, updated_at: new Date().toISOString() };
}

/**
 * When a source's version changes, mark dependent pending/approved inferences
 * stale. Never silently replace an approved value with a new inference.
 */
export function markStaleOnSourceUpdate(
  job: IAnalysisJob,
  sourceRef: string,
  newVersion: string,
): IAnalysisJob {
  const inferences: IInferredField[] = job.inferences.map((inf) => {
    if (inf.source.ref !== sourceRef) return inf;
    if (inf.source.version === newVersion) return inf;
    if (inf.decision === EInferenceDecision.Rejected) {
      return { ...inf, source: { ...inf.source, version: newVersion } };
    }
    // Approved and pending become stale; value is preserved for audit.
    return {
      ...inf,
      decision: EInferenceDecision.Stale,
      source: { ...inf.source, version: newVersion },
    };
  });
  const sources = job.sources.map((s) =>
    s.ref === sourceRef ? { ...s, version: newVersion } : s,
  );
  return { ...job, sources, inferences, updated_at: new Date().toISOString() };
}

export function cancelJob(job: IAnalysisJob): IAnalysisJob {
  if (isTerminalJob(job.status) && job.status !== EAnalysisJobStatus.Failed) {
    if (job.status === EAnalysisJobStatus.Cancelled) return job;
    throw new Error(`Cannot cancel a ${job.status} analysis job.`);
  }
  return {
    ...job,
    status: EAnalysisJobStatus.Cancelled,
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    temp_files_cleaned: true,
  };
}

/** Usable results survive partial failure — completed inferences remain. */
export function usableInferences(job: IAnalysisJob): IInferredField[] {
  return job.inferences.filter(
    (i) =>
      i.decision === EInferenceDecision.Approved ||
      (i.decision === EInferenceDecision.Pending &&
        (job.status === EAnalysisJobStatus.Partial ||
          job.status === EAnalysisJobStatus.Completed ||
          job.status === EAnalysisJobStatus.NeedsInput)),
  );
}
