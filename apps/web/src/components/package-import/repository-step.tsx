"use client";

import { GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useGitHubRepos, useLinkGitHubRepo } from "@/hooks/auth/use-auth";
import { cn } from "@/lib/utils";
import type { IProject } from "@/types";

type RepoChoice = "connect" | "later";

/** Step 5. Deliberately narrower than the ticket's five options: connect an
 *  existing repo, or decide later.
 *
 *  Creating a repository, multi-repo and monorepo layouts are not offered
 *  because the backend has no endpoint that creates a repo from an approved
 *  architecture — offering the choice would be a button that cannot work. The
 *  omission is visible to the user rather than silent. */
export function RepositoryStep({
  workspaceSlug,
  project,
  onContinue,
}: {
  workspaceSlug: string;
  project: IProject | undefined;
  onContinue: () => void;
}) {
  const [choice, setChoice] = useState<RepoChoice>(project?.repo_full_name ? "connect" : "later");
  const repos = useGitHubRepos(workspaceSlug, choice === "connect");
  // The dedicated link-repo endpoint, not a generic project update: linking
  // also flips clone_status and triggers the backend clone.
  const linkRepo = useLinkGitHubRepo(workspaceSlug, project?.id ?? "");
  const connected = project?.repo_full_name ?? null;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-base font-medium text-foreground">Where will the code live?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Linking a repository lets imported work reference real code later — it does not
          affect what gets created.
        </p>
      </header>

      {connected ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3.5 py-3">
          <HugeiconsIcon icon={GithubIcon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{connected}</span>
            <span className="text-xs text-muted-foreground">Already linked to this project</span>
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  id: "connect" as const,
                  title: "Connect an existing repository",
                  detail: "Pick a repo this workspace can already see on GitHub.",
                },
                {
                  id: "later" as const,
                  title: "Decide later",
                  detail: "Import the plan now and link a repository when there is one.",
                },
              ]
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={choice === option.id}
                onClick={() => setChoice(option.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-4 text-left",
                  "transition-[border-color,background-color] duration-150 ease-out",
                  "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "active:scale-[0.99]",
                  choice === option.id ? "border-primary bg-accent/50" : "border-border",
                )}
              >
                <span className="text-sm font-medium text-foreground">{option.title}</span>
                <span className="text-sm text-muted-foreground">{option.detail}</span>
              </button>
            ))}
          </div>

          {choice === "connect" ? (
            <div className="rounded-md border">
              {repos.isPending ? (
                <p className="px-3.5 py-3 text-sm text-muted-foreground">Loading repositories…</p>
              ) : repos.isError ? (
                <p className="px-3.5 py-3 text-sm text-muted-foreground">
                  GitHub is not connected for this workspace. Connect it in workspace settings, or
                  choose “Decide later”.
                </p>
              ) : (repos.data?.length ?? 0) === 0 ? (
                <p className="px-3.5 py-3 text-sm text-muted-foreground">
                  No repositories available to this workspace.
                </p>
              ) : (
                <ul className="max-h-64 divide-y overflow-y-auto">
                  {repos.data?.map((repo) => (
                    <li key={repo.full_name}>
                      <button
                        type="button"
                        disabled={linkRepo.isPending}
                        onClick={() => linkRepo.mutate(repo.full_name)}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <HugeiconsIcon
                          icon={GithubIcon}
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {repo.full_name}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Creating a new repository from the approved architecture is not available yet — there is no
        endpoint behind it, so it is left out rather than shown as a button that fails.
      </p>

      <div className="flex justify-end">
        <Button type="button" onClick={onContinue}>
          Continue to review
        </Button>
      </div>
    </div>
  );
}
