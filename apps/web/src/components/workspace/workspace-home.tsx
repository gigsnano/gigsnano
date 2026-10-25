"use client";

import { useProjects } from "@/hooks/project/use-projects";
import { useMyStories } from "@/hooks/story/use-stories";
import { EmptyState } from "@/components/empty-state";
import { PendingInviteBanner } from "@/components/workspace/pending-invite-banner";

import { HomeGreeting } from "./home/home-greeting";
import { AskGigsAi } from "./home/ask-gigs-ai";
import { HomeQuickActions } from "./home/home-quick-actions";
import { HomeRecents } from "./home/home-recents";
import { HomeProjects } from "./home/home-projects";

/**
 * Workspace home — a personalized launchpad (Plane-style) rather than a flat
 * metrics dashboard: greeting → Ask GigsAI → quick actions → your work →
 * projects, in one centered, calm column.
 */
export function WorkspaceHome({ workspaceSlug }: { workspaceSlug: string }) {
  const projects = useProjects(workspaceSlug);
  const myStories = useMyStories(workspaceSlug, { open_only: true, limit: 8, offset: 0 });

  if (projects.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="mx-auto h-9 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-14 animate-pulse rounded-xl border bg-card" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-xl border bg-card" />
      </div>
    );
  }

  if (projects.isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load workspace"
          description="Something went wrong loading your projects."
          actions={[{ label: "Retry", onClick: () => projects.refetch() }]}
        />
      </div>
    );
  }

  const list = projects.data ?? [];

  if (list.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <PendingInviteBanner />
        <HomeGreeting />
        <AskGigsAi workspaceSlug={workspaceSlug} />
        <EmptyState
          assetKey="generic"
          title="Your workspace is ready"
          description="Head to Projects and click Add Project to create your first one — GigsNano seeds Sprint-0 planning automatically."
          actions={[{ label: "Go to Projects", href: `/${workspaceSlug}/projects` }]}
        />
      </div>
    );
  }

  const stories = myStories.data?.items ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:py-10">
      <PendingInviteBanner />
      <HomeGreeting />
      <AskGigsAi workspaceSlug={workspaceSlug} />
      <HomeQuickActions workspaceSlug={workspaceSlug} />
      <HomeRecents
        workspaceSlug={workspaceSlug}
        stories={stories}
        totalCount={myStories.data?.total}
      />
      <HomeProjects workspaceSlug={workspaceSlug} projects={list} />
    </div>
  );
}
