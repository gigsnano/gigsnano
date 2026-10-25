"use client";

import { useState } from "react";

import { useSyncJob, useSyncProject } from "@/hooks/project/use-projects";
import { ESyncJobStatus } from "@/types";
import { APIError } from "@/services/api-error";
import { Button } from "@/components/ui/button";

/** Pull a human message off an API/mutation error (FastAPI `{ detail }` or Error). */
function errorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const detail = (error.data as { detail?: string } | null)?.detail;
    if (detail) return detail;
    if (error.status === 409) return "No GitHub repo linked to this project.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Sync failed. Please try again.";
}

/**
 * "Sync docs to GitHub" control for a project with a linked repo. Kicks off a
 * sync job, polls it, and surfaces inline status next to the button.
 */
export function SyncDocsButton({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const sync = useSyncProject(workspaceSlug, projectId);
  const job = useSyncJob(workspaceSlug, projectId, jobId);

  const jobStatus = job.data?.status;
  const inFlight =
    sync.isPending ||
    jobStatus === ESyncJobStatus.Queued ||
    jobStatus === ESyncJobStatus.Running;

  function start() {
    sync.mutate(undefined, {
      onSuccess: (created) => setJobId(created.id),
    });
  }

  return (
    <div className="flex items-center gap-2">
      <SyncStatus
        inFlight={inFlight}
        jobStatus={jobStatus}
        filesChanged={job.data?.files_changed}
        commitSha={job.data?.commit_sha ?? null}
        jobError={job.data?.error ?? null}
        mutationError={sync.isError ? errorMessage(sync.error) : null}
      />
      <Button size="sm" variant="outline" onClick={start} disabled={inFlight}>
        {inFlight ? "Syncing…" : "Sync docs to GitHub"}
      </Button>
    </div>
  );
}

function SyncStatus({
  inFlight,
  jobStatus,
  filesChanged,
  commitSha,
  jobError,
  mutationError,
}: {
  inFlight: boolean;
  jobStatus: ESyncJobStatus | undefined;
  filesChanged: number | undefined;
  commitSha: string | null;
  jobError: string | null;
  mutationError: string | null;
}) {
  if (mutationError) {
    return <span className="text-xs text-destructive">{mutationError}</span>;
  }
  if (inFlight) {
    return <span className="text-xs text-muted-foreground">Syncing…</span>;
  }
  if (jobStatus === ESyncJobStatus.Failed) {
    return (
      <span className="text-xs text-destructive">{jobError ?? "Sync failed."}</span>
    );
  }
  if (jobStatus === ESyncJobStatus.Completed) {
    const n = filesChanged ?? 0;
    return (
      <span className="text-xs text-muted-foreground">
        {n > 0 ? `Synced ${n} file${n === 1 ? "" : "s"}` : "Up to date"}
        {commitSha ? ` · ${commitSha.slice(0, 7)}` : ""}
      </span>
    );
  }
  return null;
}
