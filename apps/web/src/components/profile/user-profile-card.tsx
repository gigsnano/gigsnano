"use client";

import Link from "next/link";

import { useMyStories } from "@/hooks/story/use-stories";
import { useUser } from "@/hooks/workspace/use-users";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/empty-state";
import { storyWorkHref } from "@/lib/issues/issue-routes";
import { EStoryStatus } from "@/types";

export function UserProfileCard({
  workspaceSlug,
  userId,
}: {
  workspaceSlug: string;
  userId: string;
}) {
  const { data, isPending, isError, refetch } = useUser(userId);
  const { data: myStoriesPage } = useMyStories(workspaceSlug, { open_only: true, limit: 5, offset: 0 });

  const assigned =
    myStoriesPage?.items.filter((s) => s.assignee_id === userId && s.status !== EStoryStatus.Done) ??
    [];

  if (isPending) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted" />;
  }

  if (isError || !data) {
    return (
      <EmptyState
        assetKey="error"
        title="User not found"
        description="This profile could not be loaded."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col items-center text-center">
          <Avatar name={data.display_name} src={data.avatar_url} size="md" />
          <h1 className="mt-4 text-lg font-semibold">{data.display_name}</h1>
          <p className="text-sm text-muted-foreground">{data.email}</p>
        </div>
        <dl className="mt-6 space-y-3 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="font-mono text-xs">{data.id}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Active assignments</h2>
        {assigned.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No open stories assigned.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {assigned.slice(0, 5).map((story) => (
              <li key={story.id} className="py-2">
                <Link
                  href={storyWorkHref(workspaceSlug, story)}
                  className="text-sm font-medium hover:text-primary"
                >
                  {story.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {story.project_name} · {story.status.replace("_", " ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
