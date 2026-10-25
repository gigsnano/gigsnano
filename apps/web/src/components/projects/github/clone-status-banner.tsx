"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useProject } from "@/hooks/project/use-projects";
import { useRetryClone } from "@/hooks/auth/use-auth";
import { queryKeys } from "@/hooks/query-keys";
import { ECloneStatus } from "@/types";

export function CloneStatusBanner({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: project } = useProject(workspaceSlug, projectId);
  const retry = useRetryClone(workspaceSlug, projectId);
  const status = project?.clone_status;

  const queryClient = useQueryClient();
  useEffect(() => {
    if (status !== ECloneStatus.Pending && status !== ECloneStatus.Cloning) return;
    const t = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
    }, 3000);
    return () => clearInterval(t);
  }, [status, queryClient, workspaceSlug, projectId]);

  if (!status || status === ECloneStatus.None || status === ECloneStatus.Ready) return null;

  const failed = status === ECloneStatus.Failed;
  return (
    <div
      className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
        failed ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-muted/40"
      }`}
    >
      <span>
        {status === ECloneStatus.Pending || status === ECloneStatus.Cloning
          ? `Cloning ${project?.repo_full_name ?? "repository"}…`
          : `Clone failed${project?.clone_error ? `: ${project.clone_error}` : ""}`}
      </span>
      {failed ? (
        <button
          type="button"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
          className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-background disabled:opacity-60"
        >
          {retry.isPending ? "Retrying…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
