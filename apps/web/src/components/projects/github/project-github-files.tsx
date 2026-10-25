"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useGitHubStatus } from "@/hooks/auth/use-auth";
import { useProject, useWorkspaceTree } from "@/hooks/project/use-projects";
import { queryKeys } from "@/hooks/query-keys";
import { EmptyState } from "@/components/empty-state";
import { ECloneStatus } from "@/types";

import { CloneStatusBanner } from "./clone-status-banner";
import { ConnectGitHubDialog } from "./connect-github-dialog";
import { RepoFileExplorer } from "./repo-file-explorer";

export function ProjectGitHubFiles({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const project = useProject(workspaceSlug, projectId);
  const github = useGitHubStatus(workspaceSlug);
  const tree = useWorkspaceTree(workspaceSlug, projectId);
  const queryClient = useQueryClient();

  const cloneStatus = project.data?.clone_status;
  // Repopulating = the workspace is (or should be) filling in: an in-flight
  // clone (PENDING/CLONING), OR a repo-linked project whose files are missing
  // while the DB still says READY. The tree endpoint self-heals that divergence
  // (ephemeral storage wiped on redeploy) by re-cloning, so we keep polling both
  // project + tree until files land. Stop on FAILED — the retry UI takes over.
  const hasRepoLinked = Boolean(project.data?.repo_full_name);
  const treeEmpty = tree.isSuccess && (tree.data?.length ?? 0) === 0;
  const isRepopulating =
    hasRepoLinked && treeEmpty && cloneStatus !== ECloneStatus.Failed;

  useEffect(() => {
    if (!isRepopulating) return;
    const t = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceTree(workspaceSlug, projectId) });
    }, 3000);
    return () => clearInterval(t);
  }, [isRepopulating, queryClient, workspaceSlug, projectId]);

  if (project.isPending || github.isPending || tree.isPending) {
    return <div className="h-72 animate-pulse rounded-lg border bg-muted" />;
  }

  if (project.isError || !project.data) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load project"
        description="Something went wrong fetching this project."
        actions={[{ label: "Retry", onClick: () => project.refetch() }]}
      />
    );
  }

  const connected = github.data?.connected ?? false;
  const repoUrl =
    project.data.repo_full_name
      ? `https://github.com/${project.data.repo_full_name}`
      : (github.data?.repo_url ?? "");
  const boardHref = `/${workspaceSlug}/projects/${projectId}/board`;
  const entries = tree.data ?? [];
  const hasRepo = Boolean(project.data.repo_full_name);
  const cloneReady = cloneStatus === ECloneStatus.Ready;

  if (tree.isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load workspace files"
        description="Something went wrong reading this project's workspace."
        actions={[{ label: "Retry", onClick: () => tree.refetch() }]}
      />
    );
  }

  if (isRepopulating) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <CloneStatusBanner workspaceSlug={workspaceSlug} projectId={projectId} />
        <EmptyState
          assetKey="project"
          title="Cloning repository"
          description={`Fetching files from ${project.data.repo_full_name ?? "your repository"}. This usually takes a few seconds.`}
        />
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <CloneStatusBanner workspaceSlug={workspaceSlug} projectId={projectId} />
        <div className="flex flex-col items-center">
          <EmptyState
            assetKey="project"
            title={hasRepo && !cloneReady ? "Clone not ready" : "No files yet"}
            description={
              hasRepo && cloneStatus === ECloneStatus.Failed
                ? "The repository clone failed. Retry below, or complete Sprint-0 to generate planning docs."
                : "Connect a repo or complete Sprint-0 to populate the workspace with your repository and BMAD planning docs."
            }
            actions={[{ label: "Go to Sprint-0 board", href: boardHref }]}
          />
          {!connected ? (
            <div className="-mt-6 pb-8">
              <ConnectGitHubDialog />
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <>
      <CloneStatusBanner workspaceSlug={workspaceSlug} projectId={projectId} />
      <RepoFileExplorer
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        repoUrl={repoUrl}
      />
    </>
  );
}
