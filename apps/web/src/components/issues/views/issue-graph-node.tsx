"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { peekHref } from "@/lib/issues/issue-routes";
import { PriorityGlyph } from "@/components/issues/shared/priority-glyph";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { StoryCode } from "@/components/issues/shared/story-code";
import type { IStory } from "@/types";

export interface IIssueGraphNodeData extends Record<string, unknown> {
  story: IStory;
  /** On a blocking cycle — the work can never start, so it is called out rather than
   * silently drawn as an ordinary arrow. */
  inCycle: boolean;
}

/** One work item on the dependency graph. Composes the same status/priority/code
 * primitives the list and spreadsheet use, so a card reads identically everywhere. */
export function IssueGraphNode({ data }: NodeProps) {
  const { story, inCycle } = data as IIssueGraphNodeData;

  return (
    <Link
      href={peekHref(story)}
      title={inCycle ? "This item is in a blocking cycle" : story.title}
      className={cn(
        "flex w-[220px] items-start gap-2 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-accent",
        inCycle && "border-destructive",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <StatusIcon status={story.status} className="mt-0.5 size-4 shrink-0" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <StoryCode code={story.code} />
          {story.priority ? <PriorityGlyph priority={story.priority} className="size-3" /> : null}
          {inCycle ? (
            <span className="rounded bg-destructive/10 px-1 text-[10px] font-medium text-destructive">
              cycle
            </span>
          ) : null}
        </span>
        <span className="line-clamp-2 text-xs text-foreground">{story.title}</span>
      </span>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </Link>
  );
}
