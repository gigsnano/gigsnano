"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { RepoPicker } from "@/components/projects/github";
import { useGitHubStatus } from "@/hooks/auth/use-auth";
import { useCreateGitHubImport, useGitHubImportPreview } from "@/hooks/integrations/use-imports";
import { useProjects } from "@/hooks/project/use-projects";
import { importErrorMessage } from "@/lib/imports/error-message";

/** GitHub-issues importer (GIN-23b) — pick a connected repo + project target, a
 * dry-run preview, then confirm. Reuses the workspace's existing GitHub OAuth
 * connection (via the shared `RepoPicker`, which fetches the repo list once and
 * filters client-side — no free-text owner/repo fields, no per-keystroke fetch). */
export function GitHubImportWizard({ workspaceSlug }: { workspaceSlug: string }) {
  const github = useGitHubStatus(workspaceSlug);
  const projects = useProjects(workspaceSlug, true);
  const [repoFullName, setRepoFullName] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");

  const [owner, repo] = repoFullName?.split("/") ?? [null, null];
  const preview = useGitHubImportPreview(workspaceSlug, owner ?? "", repo ?? "", Boolean(repoFullName));
  const create = useCreateGitHubImport(workspaceSlug);

  if (github.isPending) return null;

  if (!github.data?.connected) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">GitHub issues</p>
        <p className="mt-1 text-muted-foreground">
          Connect GitHub first to import issues as work items.{" "}
          <Link href={`/${workspaceSlug}/settings/integrations`} className="text-primary hover:underline">
            Go to Integrations
          </Link>
        </p>
      </div>
    );
  }

  const onConfirm = async () => {
    if (!owner || !repo || !projectId) return;
    try {
      await create.mutateAsync({ owner, repo, project_id: projectId });
      setRepoFullName(null);
    } catch {
      // create.isError drives the message below
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium">GitHub issues</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Import a repository&apos;s issues (open + closed, PRs excluded) as work items.
        Re-importing skips issues already brought in.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <RepoPicker workspaceSlug={workspaceSlug} value={repoFullName} onChange={setRepoFullName} />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Target project"
          className="w-fit rounded-md border bg-background px-2.5 py-1.5 text-sm"
        >
          <option value="">Choose a project…</option>
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {repoFullName ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {preview.isPending ? (
            <p className="text-xs text-muted-foreground">Checking repository…</p>
          ) : preview.isError ? (
            <p className="text-xs text-destructive">{importErrorMessage(preview.error)}</p>
          ) : preview.data ? (
            <p className="text-xs text-muted-foreground">
              {preview.data.issue_count} issues · {preview.data.label_count} labels ·{" "}
              {preview.data.assignee_count} assignees found
            </p>
          ) : null}
          <Button
            size="sm"
            disabled={!preview.data || !projectId || create.isPending}
            onClick={onConfirm}
          >
            {create.isPending ? "Importing…" : "Import issues"}
          </Button>
        </div>
      ) : null}
      {create.isError ? (
        <p className="mt-2 text-xs text-destructive">{importErrorMessage(create.error)}</p>
      ) : null}
    </div>
  );
}
