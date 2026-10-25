"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { PriorityGlyph } from "@/components/issues/shared/priority-glyph";
import { relativeTime } from "@/lib/format/relative-time";
import { storyWorkHref } from "@/lib/issues/issue-routes";
import type { IAssignedStory } from "@/types";

import { HomeSection } from "./home-section";

/** "Your work" — the caller's open items, most-recent first, as tappable rows. */
export function HomeRecents({
  workspaceSlug,
  stories,
  totalCount,
}: {
  workspaceSlug: string;
  stories: IAssignedStory[];
  totalCount?: number;
}) {
  if (stories.length === 0) return null;

  return (
    <HomeSection
      title="Your work"
      count={totalCount ?? stories.length}
      viewAllHref={`/${workspaceSlug}/work-items`}
    >
      <ul className="overflow-hidden rounded-xl border bg-card">
        {stories.map((s, i) => (
          <li key={s.id} style={{ "--i": i } as CSSProperties} className="t-home-rise">
            <Link
              href={storyWorkHref(workspaceSlug, s)}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 ease-out",
                "border-b last:border-b-0 hover:bg-accent/50",
              )}
            >
              <PriorityGlyph priority={s.priority} className="shrink-0" />
              <StatusIcon status={s.status} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {s.title}
              </span>
              <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">
                {s.project_name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {relativeTime(s.updated_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
