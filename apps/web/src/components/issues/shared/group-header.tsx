"use client";

import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import type { IAssigneePreview } from "@/lib/issues/story-assignees";
import type { TAgentAvatar } from "@/lib/issues/assignee-avatars";
import type { TGroupBy } from "@/store/ui/issues-view.store";
import { STORY_STATUS_META, STORY_PRIORITY_META, STORY_TYPE_META } from "@/constants/story-meta";
import { EStoryStatus, EStoryPriority, EStoryType } from "@/types";

import { StatusIcon } from "./status-icon";
import { PriorityGlyph } from "./priority-glyph";
import { TypeGlyph } from "./type-glyph";

/** Resolve a group's icon + label from the grouping dimension and its key. */
export function groupMeta(
  groupBy: TGroupBy,
  key: string,
  assignees: Map<string, IAssigneePreview>,
  agents?: Map<string, TAgentAvatar>,
): { icon: ReactNode; label: string } {
  if (typeof groupBy === "string" && groupBy.startsWith("cf:")) {
    return {
      icon: <span className="size-4 rounded-sm border" />,
      label: key === "__none__" ? "None" : key,
    };
  }
  if (groupBy === "status") {
    const status = key as EStoryStatus;
    return { icon: <StatusIcon status={status} />, label: STORY_STATUS_META[status].label };
  }
  if (groupBy === "priority") {
    const priority = key as EStoryPriority;
    return { icon: <PriorityGlyph priority={priority} />, label: STORY_PRIORITY_META[priority].label };
  }
  if (groupBy === "type") {
    const type = key as EStoryType;
    return { icon: <TypeGlyph type={type} />, label: STORY_TYPE_META[type].label };
  }
  if (groupBy === "assignee") {
    if (key === "unassigned") {
      return {
        icon: <span className="size-4 rounded-full border border-dashed" />,
        label: "Unassigned",
      };
    }
    const a = assignees.get(key);
    if (a) {
      return {
        icon: <Avatar name={a.display_name} src={a.avatar_url} size="xs" />,
        label: a.display_name,
      };
    }
    const agent = agents?.get(key);
    if (agent) {
      return {
        icon: (
          <AgentAvatar
            role={agent.role}
            persona={agent.persona}
            display_name={agent.display_name}
            size="xs"
            pop={false}
          />
        ),
        label: agent.display_name,
      };
    }
    return {
      icon: <Avatar name="?" src={null} size="xs" />,
      label: "Unknown",
    };
  }
  return { icon: null, label: "All work items" };
}
