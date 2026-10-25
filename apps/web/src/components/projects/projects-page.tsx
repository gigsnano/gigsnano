"use client";

import { useEffect, useState } from "react";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Switch } from "@/components/ui/switch";
import { useProjects } from "@/hooks/project/use-projects";
import { useWorkspaceAdmin } from "@/hooks/workspace/use-workspace-admin";
import { EProjectFlow, EProjectView, type IProject } from "@/types";
import {
  clearCreateProjectDraft,
  makeEmptyDraft,
  peekCreateProjectDraft,
} from "@/lib/projects/create-project-draft";

import { ProjectsToolbar } from "./projects-toolbar";
import { ProjectCardSkeleton } from "./project-card";
import { CreateContainerFlow } from "@/components/solutions";
import { ProjectsGallery } from "./views/projects-gallery";
import { ProjectsListView } from "./views/projects-list-view";
import { ProjectsTable } from "./views/projects-table";
import { ProjectsGantt } from "./views/gantt/projects-gantt";

/**
 * Pure — reads the resume signal the GitHub OAuth redirect left behind
 * (`?resumeCreate=existing` + a persisted draft). Returns the draft to seed the
 * reopened create dialog, or null. Peeks only; the effect below consumes it.
 */
function readResumeDraft(workspaceSlug: string) {
  if (typeof window === "undefined") return null;
  if (new URL(window.location.href).searchParams.get("resumeCreate") !== "existing") return null;
  return peekCreateProjectDraft(workspaceSlug) ?? makeEmptyDraft(EProjectFlow.Existing);
}

export function ProjectsPage({ workspaceSlug }: { workspaceSlug: string }) {
  const { isAdmin } = useWorkspaceAdmin(workspaceSlug);
  const [showAll, setShowAll] = useState(false);
  const { data: projects, isPending, isError, refetch } = useProjects(
    workspaceSlug,
    isAdmin && showAll,
  );
  const [view, setView] = useState<EProjectView>(EProjectView.Gallery);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // Seed once (pure) from the OAuth-return signal, then let the user close it.
  const [resumeDraft] = useState(() => readResumeDraft(workspaceSlug));
  const [resumeOpen, setResumeOpen] = useState(resumeDraft !== null);

  // Consume the one-shot resume signal after mount: drop the stored draft and
  // strip the query param (a history cleanup, not a navigation) so a refresh
  // won't reopen the dialog. No setState here — nothing to re-render.
  useEffect(() => {
    if (resumeDraft === null) return;
    clearCreateProjectDraft();
    const url = new URL(window.location.href);
    if (url.searchParams.has("resumeCreate")) {
      url.searchParams.delete("resumeCreate");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
  }, [resumeDraft]);

  const q = query.trim().toLowerCase();
  const filtered: IProject[] = !projects
    ? []
    : !q
      ? projects
      : projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.identifier.toLowerCase().includes(q),
        );

  return (
    <>
      {/* Reopened after the GitHub OAuth redirect, seeded with the saved draft. */}
      {resumeDraft ? (
        <CreateContainerFlow
          workspaceSlug={workspaceSlug}
          open={resumeOpen}
          onOpenChange={setResumeOpen}
          initialDraft={resumeDraft}
        />
      ) : null}
      <AppHeader
        actions={
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <label
                htmlFor="show-all-projects"
                className="flex select-none items-center gap-2 text-sm text-muted-foreground"
              >
                Show all
                <Switch
                  id="show-all-projects"
                  checked={showAll}
                  onCheckedChange={setShowAll}
                  aria-label="Show all projects in this workspace"
                />
              </label>
            ) : null}
            <ProjectsToolbar
              workspaceSlug={workspaceSlug}
              view={view}
              onViewChange={setView}
              query={query}
              onQueryChange={setQuery}
            />
          </div>
        }
      />
      <ContentWrapper className="p-6">
        {isPending ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load projects"
            description="Something went wrong fetching your projects. Please try again."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : projects.length === 0 ? (
          <>
            <EmptyState
              assetKey="project"
              title={isAdmin ? "No projects to show" : "No projects yet"}
              description={
                isAdmin
                  ? "You're not a member of any project yet. Toggle Show all projects to see every project in this workspace, or create a new one."
                  : "You haven't been added to any projects yet. Ask a workspace admin to add you."
              }
              actions={[{ label: "New project", onClick: () => setCreateOpen(true) }]}
            />
            <CreateContainerFlow
              workspaceSlug={workspaceSlug}
              open={createOpen}
              onOpenChange={setCreateOpen}
            />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState
            assetKey="generic"
            title="No matching projects"
            description={`No projects match "${query}".`}
            actions={[{ label: "Clear search", onClick: () => setQuery("") }]}
          />
        ) : view === EProjectView.Gallery ? (
          <ProjectsGallery projects={filtered} workspaceSlug={workspaceSlug} />
        ) : view === EProjectView.List ? (
          <ProjectsListView projects={filtered} workspaceSlug={workspaceSlug} />
        ) : view === EProjectView.Table ? (
          <ProjectsTable projects={filtered} workspaceSlug={workspaceSlug} />
        ) : (
          <ProjectsGantt projects={filtered} workspaceSlug={workspaceSlug} />
        )}
      </ContentWrapper>
    </>
  );
}
