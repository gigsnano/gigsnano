import type { IStory } from "@/types";
import type { ICreateStoryPayload } from "@/services/story/story.service";
import { storyTypeOf } from "./story-type";
import { issueDetailHref } from "./issue-routes";

/** Full URL for a work item detail page. */
function issueLinkUrl(workspaceSlug: string, story: IStory): string {
  if (typeof window === "undefined") {
    return issueDetailHref(workspaceSlug, story);
  }
  return `${window.location.origin}${issueDetailHref(workspaceSlug, story)}`;
}

export async function copyIssueLink(workspaceSlug: string, story: IStory): Promise<void> {
  await navigator.clipboard?.writeText(issueLinkUrl(workspaceSlug, story));
}

export async function copyStoryId(story: IStory): Promise<void> {
  await navigator.clipboard?.writeText(story.id);
}

export function openIssueInNewTab(workspaceSlug: string, story: IStory): void {
  window.open(issueDetailHref(workspaceSlug, story), "_blank", "noopener,noreferrer");
}

/** Payload for "Make a copy" from an existing work item. */
export function issueCopyPayload(story: IStory): ICreateStoryPayload {
  return {
    title: `${story.title} (copy)`,
    description: story.description,
    status: story.status,
    priority: story.priority,
    type: storyTypeOf(story),
    assignee_id: story.assignee_id,
    label_ids: story.label_ids ?? [],
    parent_id: story.parent_id,
    cycle_id: story.cycle_id,
    module_id: story.module_id,
    start_date: story.start_date,
    target_date: story.target_date,
    estimate_id: story.estimate_id,
    estimate_points: story.estimate_points,
  };
}
