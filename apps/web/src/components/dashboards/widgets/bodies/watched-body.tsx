"use client";

import { type IWidgetSettings } from "@/types";

import { StoryListBody } from "./story-list-body";

/**
 * Jira parity — "Watched work items". The subscription set is resolved server-side
 * from the session user, so this can only ever show the viewer's own watch list.
 */
export function WatchedBody({
  workspaceSlug,
  settings,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  return (
    <StoryListBody
      workspaceSlug={workspaceSlug}
      settings={settings}
      query={{ watching: true }}
      emptyMessage="You're not watching any work items."
    />
  );
}
