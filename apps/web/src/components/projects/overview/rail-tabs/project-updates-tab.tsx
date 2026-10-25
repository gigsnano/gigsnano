"use client";

import { EmptyState } from "@/components/empty-state";

/**
 * Right-rail "Project Updates" tab. The updates feature isn't built yet, so this
 * renders a consistent EmptyState (mirrors Plane's disabled-feature state).
 */
export function ProjectUpdatesTab() {
  return (
    <EmptyState
      assetKey="generic"
      align="center"
      title="Project updates"
      description="Post status updates to keep your team aligned on what's next. Coming soon."
      actions={[{ label: "Turn on updates", disabled: true }]}
    />
  );
}
