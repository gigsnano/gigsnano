"use client";

import { useAuthUser } from "@/hooks/auth/use-auth";
import { EStoryStatus, type IWidgetSettings } from "@/types";

import { StoryListBody } from "./story-list-body";
import { WidgetMessage } from "./widget-body-shared";

/**
 * Jira parity — "Assigned to me" / "Work items in progress".
 *
 * Both are the work-item list with the viewer pinned as assignee, so they reuse
 * it rather than re-implementing the row rendering. The pinned filters override
 * the widget's own settings: a widget called "Assigned to me" showing someone
 * else's work would be a lie, so those fields aren't the user's to set.
 */
function MyWorkBody({
  workspaceSlug,
  settings,
  status,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
  status?: EStoryStatus;
}) {
  const { data: user, isPending } = useAuthUser();

  if (isPending) return null;
  if (!user) return <WidgetMessage>Sign in to see your work.</WidgetMessage>;

  return (
    <StoryListBody
      workspaceSlug={workspaceSlug}
      settings={{ ...settings, assignee_id: user.id, ...(status ? { status } : {}) }}
    />
  );
}

export function AssignedToMeBody(props: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  return <MyWorkBody {...props} />;
}

export function InProgressBody(props: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  return <MyWorkBody {...props} status={EStoryStatus.InProgress} />;
}
