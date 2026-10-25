"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Tick02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  useAnalysisJob,
  useCancelAnalysis,
  useDecideInference,
  useRetryAnalysis,
  useStartAnalysis,
} from "@/hooks/solution/use-solution-runtime";
import { cn } from "@/lib/utils";
import {
  EAnalysisJobStatus,
  EAnalysisSourceKind,
  EInferenceDecision,
} from "@/types/solution/analysis";

/**
 * Observable analysis panel (GIN-448). Jobs keep running after navigation —
 * this panel resumes by job id. Inferences always show their source.
 */

export function AnalysisProgressPanel({
  workspaceSlug,
  setupDraftId,
  jobId,
  onJobId,
  onContinue,
  onCancel,
}: {
  workspaceSlug: string;
  setupDraftId: string | null;
  jobId: string | null;
  onJobId: (id: string) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const start = useStartAnalysis(workspaceSlug);
  const jobQuery = useAnalysisJob(workspaceSlug, jobId);
  const retry = useRetryAnalysis(workspaceSlug);
  const cancelJob = useCancelAnalysis(workspaceSlug);
  const decide = useDecideInference(workspaceSlug);

  const job = jobQuery.data;
  const busy = start.isPending || retry.isPending || cancelJob.isPending;

  const begin = () => {
    if (!setupDraftId) return;
    start.mutate(
      {
        setup_draft_id: setupDraftId,
        sources: [
          {
            kind: EAnalysisSourceKind.Artifact,
            ref: setupDraftId,
            version: "1",
            label: "Setup draft",
          },
        ],
      },
      { onSuccess: (created) => onJobId(created.id) },
    );
  };

  if (!jobId || !job) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Start analysis to import context. It keeps running if you leave — come back to this draft
          to resume.
        </p>
        {!setupDraftId ? (
          <p role="alert" className="text-sm text-destructive">
            Save a setup draft before starting analysis.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={!setupDraftId || busy} onClick={begin}>
            {start.isPending ? "Starting…" : "Start analysis"}
          </Button>
        </div>
      </div>
    );
  }

  const terminal =
    job.status === EAnalysisJobStatus.Completed ||
    job.status === EAnalysisJobStatus.Partial ||
    job.status === EAnalysisJobStatus.Failed ||
    job.status === EAnalysisJobStatus.Cancelled;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium capitalize text-foreground">
            {job.status.replaceAll("_", " ")}
          </span>
          <span className="text-muted-foreground">{Math.round(job.ratio * 100)}%</span>
        </div>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(job.ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Analysis progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(job.ratio * 100)}%` }}
          />
        </div>
        <ul className="mt-3 space-y-1.5 text-xs">
          {job.sub_results.map((sub) => (
            <li key={sub.key} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{sub.label}</span>
              <span
                className={cn(
                  "capitalize",
                  sub.status === "completed" && "text-foreground",
                  sub.status === "failed" && "text-destructive",
                )}
              >
                {sub.status.replaceAll("_", " ")}
              </span>
            </li>
          ))}
        </ul>
        {job.progress.length > 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground" aria-live="polite">
            {job.progress[job.progress.length - 1]?.message}
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Inferred facts
        </p>
        <ul className="mt-2 space-y-2">
          {job.inferences.map((inf) => (
            <li
              key={inf.field_key}
              className="rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {inf.field_key}{" "}
                    <span className="font-normal text-muted-foreground">
                      = {String(inf.value)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Source: {inf.source.label} · v{inf.source.version} ·{" "}
                    {Math.round(inf.confidence * 100)}% confidence ·{" "}
                    <span className="capitalize">{inf.decision}</span>
                  </p>
                </div>
                {inf.decision === EInferenceDecision.Pending ||
                inf.decision === EInferenceDecision.Stale ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({
                          jobId: job.id,
                          fieldKey: inf.field_key,
                          decision: EInferenceDecision.Approved,
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate({
                          jobId: job.id,
                          fieldKey: inf.field_key,
                          decision: EInferenceDecision.Rejected,
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                ) : inf.decision === EInferenceDecision.Approved ? (
                  <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {job.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
          {job.error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel setup
        </Button>
        {!terminal ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => cancelJob.mutate(job.id)}
          >
            Stop analysis
          </Button>
        ) : null}
        {job.status === EAnalysisJobStatus.Failed ||
        job.status === EAnalysisJobStatus.Partial ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => retry.mutate(job.id)}
          >
            Retry
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={!terminal || job.status === EAnalysisJobStatus.Cancelled}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
