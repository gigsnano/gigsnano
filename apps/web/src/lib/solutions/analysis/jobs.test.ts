import { describe, expect, it } from "vitest";

import {
  EAnalysisJobStatus,
  EAnalysisSourceKind,
  EAnalysisSubStatus,
  EInferenceDecision,
  type IAnalysisJob,
} from "@/types/solution/analysis";

import {
  cancelJob,
  decideInference,
  markStaleOnSourceUpdate,
  planRetry,
  usableInferences,
  validateUpload,
} from "./index";

function job(partial: Partial<IAnalysisJob> = {}): IAnalysisJob {
  const now = "2026-07-26T00:00:00.000Z";
  return {
    id: "job-1",
    workspace_slug: "acme",
    setup_draft_id: "draft-1",
    status: EAnalysisJobStatus.Partial,
    sources: [
      {
        kind: EAnalysisSourceKind.Repository,
        ref: "acme/app",
        version: "v1",
        label: "acme/app",
      },
    ],
    sub_results: [
      {
        key: "index",
        label: "Index repository",
        status: EAnalysisSubStatus.Completed,
        artifact_id: "art-index",
        error: null,
      },
      {
        key: "extract",
        label: "Extract facts",
        status: EAnalysisSubStatus.Failed,
        artifact_id: null,
        error: "timeout",
      },
    ],
    inferences: [
      {
        field_key: "name",
        value: "App",
        confidence: 0.8,
        source: {
          kind: EAnalysisSourceKind.Repository,
          ref: "acme/app",
          version: "v1",
          label: "acme/app",
        },
        decision: EInferenceDecision.Pending,
        decided_by: null,
        decided_at: null,
      },
    ],
    progress: [],
    ratio: 0.5,
    error: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    cancelled_at: null,
    temp_files_cleaned: false,
    ...partial,
  };
}

describe("validateUpload", () => {
  it("accepts allowed types under the size limit", () => {
    expect(
      validateUpload({ name: "brief.pdf", size: 1024, type: "application/pdf" }).ok,
    ).toBe(true);
  });

  it("rejects executables and oversize files", () => {
    expect(validateUpload({ name: "x.exe", size: 10, type: "application/pdf" }).ok).toBe(
      false,
    );
    expect(
      validateUpload({
        name: "big.pdf",
        size: 50 * 1024 * 1024,
        type: "application/pdf",
      }).ok,
    ).toBe(false);
  });
});

describe("planRetry", () => {
  it("keeps completed sub-results and their artifacts", () => {
    const retried = planRetry(job());
    expect(retried.sub_results[0]?.status).toBe(EAnalysisSubStatus.Completed);
    expect(retried.sub_results[0]?.artifact_id).toBe("art-index");
    expect(retried.sub_results[1]?.status).toBe(EAnalysisSubStatus.Pending);
    expect(retried.status).toBe(EAnalysisJobStatus.Queued);
  });
});

describe("decideInference + stale", () => {
  it("links every inference to a source and preserves approvals on source update", () => {
    const approved = decideInference(
      job(),
      "name",
      EInferenceDecision.Approved,
      "user-1",
    );
    expect(approved.inferences[0]?.source.ref).toBe("acme/app");
    expect(approved.inferences[0]?.decision).toBe(EInferenceDecision.Approved);

    const stale = markStaleOnSourceUpdate(approved, "acme/app", "v2");
    expect(stale.inferences[0]?.decision).toBe(EInferenceDecision.Stale);
    expect(stale.inferences[0]?.value).toBe("App");
  });
});

describe("cancelJob", () => {
  it("marks temp files cleaned", () => {
    const cancelled = cancelJob(job({ status: EAnalysisJobStatus.Running }));
    expect(cancelled.status).toBe(EAnalysisJobStatus.Cancelled);
    expect(cancelled.temp_files_cleaned).toBe(true);
  });
});

describe("usableInferences", () => {
  it("keeps usable results under partial failure", () => {
    const approved = decideInference(
      job(),
      "name",
      EInferenceDecision.Approved,
      "user-1",
    );
    expect(usableInferences(approved)).toHaveLength(1);
  });
});
