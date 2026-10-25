"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GitBranchIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useDisconnectGitHub,
  useGitHubInstallUrl,
  useGitHubStatus,
  useLinkGitHubRepo,
} from "@/hooks/auth/use-auth";
import { useProject } from "@/hooks/project/use-projects";
import { cn } from "@/lib/utils";
import { projectSetupPath } from "@/lib/nav/relocated-project-routes";

import { RepoPicker } from "./repo-picker";

export function ConnectGitHubDialog() {
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const slug = workspaceSlug ?? "acme";
  const { data: status } = useGitHubStatus(slug);
  const { data: project } = useProject(slug, projectId ?? "");
  const installUrl = useGitHubInstallUrl();
  const disconnect = useDisconnectGitHub(slug);
  const link = useLinkGitHubRepo(slug, projectId ?? "");
  const [open, setOpen] = useState(false);

  const connected = status?.connected ?? false;
  // Prefer THIS project's linked repo (set at brownfield create) over the
  // workspace-level OAuth connection, whose repo_url is null after a bare
  // authorize. Mirrors project-github-files.tsx.
  const repoName = project?.repo_full_name ?? null;
  const repoUrl = repoName
    ? `https://github.com/${repoName}`
    : (status?.repo_url ?? null);

  // Real GitHub OAuth web flow (same as settings/integrations + repo-picker):
  // get the authorize URL, leave crumbs for the callback page (which has no
  // workspace/return in its URL), then hand the browser to GitHub.
  const onConnect = async () => {
    const { url } = await installUrl.mutateAsync(slug);
    sessionStorage.setItem("gh_oauth_ws", slug);
    sessionStorage.setItem("gh_oauth_return", window.location.pathname);
    window.location.href = url;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="transition-transform duration-150 ease-out active:scale-[0.97]">
          <HugeiconsIcon icon={GitBranchIcon} className="size-4" />
          <ConnectionLabel connected={connected} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Connect GitHub</DialogTitle>
        <DialogDescription>
          When Sprint-0 completes, planning docs sync to your repository.
        </DialogDescription>
        {connected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {repoName ? (
                <>
                  Linked to{" "}
                  <a
                    href={repoUrl ?? `https://github.com/${repoName}`}
                    className="font-medium text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {repoName}
                  </a>
                  . Pick a different repository below to re-link.
                </>
              ) : (
                "GitHub is connected. Pick a repository to link to this project — its files are cloned and Sprint-0 docs sync back to it."
              )}
            </p>
            {projectId ? (
              <RepoPicker
                workspaceSlug={slug}
                value={repoName}
                onChange={(next) => {
                  if (next && next !== repoName && !link.isPending) {
                    link.mutate(next);
                  }
                }}
              />
            ) : null}
            {link.isPending ? (
              <p className="text-xs text-muted-foreground">Linking {link.variables}…</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate(undefined, { onSuccess: () => setOpen(false) })}
            >
              Disconnect
            </Button>
            {projectId && repoName ? (
              <Button asChild type="button" className="w-full">
                <Link href={projectSetupPath(slug, projectId, "repository")} onClick={() => setOpen(false)}>
                  Browse repository files
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Authorize GigsNano to access your repositories, then pick one to sync to.
            </p>
            <Button
              type="button"
              className="w-full transition-transform duration-150 ease-out active:scale-[0.97]"
              disabled={installUrl.isPending}
              onClick={onConnect}
            >
              {installUrl.isPending ? "Opening…" : "Authorize with GitHub"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Both labels share one grid cell, so the button keeps the wider label's
 *  width and the project header doesn't shift when the status loads. */
function ConnectionLabel({ connected }: { connected: boolean }) {
  return (
    <span className="grid">
      <span className={cn("col-start-1 row-start-1", connected && "invisible")}>Connect GitHub</span>
      <span className={cn("col-start-1 row-start-1", !connected && "invisible")}>GitHub connected</span>
    </span>
  );
}
