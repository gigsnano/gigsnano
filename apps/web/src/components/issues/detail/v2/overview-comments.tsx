"use client";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CommentBody } from "@/components/issues/shared/comment-body";
import { CommentComposer } from "@/components/issues/shared/comment-composer";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { useCreateStoryComment, useStoryComments } from "@/hooks/story/use-story-detail";
import { formatTimestamp } from "@/lib/format/timestamp";
import { isEditorHtmlEmpty } from "@/lib/editor/is-html-empty";
import type { WorkItemTab } from "@/lib/issues/work-item-tabs";
import { useCommentDraftStore } from "@/store/ui/comment-draft.store";

/** Latest few, per the spec — the full feed is the Activity tab's job. */
const RECENT_LIMIT = 4;

/**
 * Comments on Overview (GIN-480): composer plus the most recent few.
 *
 * Deliberately not the audit feed — that is Activity (GIN-484). What this fixes
 * is that `IssueActivity` was the LAST of fourteen blocks, so replying to a
 * colleague meant scrolling past every configuration surface on the page.
 *
 * The draft lives in a store rather than local state so switching tabs doesn't
 * throw away half a sentence.
 */
export function OverviewComments({
  workspaceSlug,
  projectId,
  storyId,
  onGoToTab,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  onGoToTab: (tab: WorkItemTab) => void;
}) {
  const draft = useCommentDraftStore((s) => s.drafts[storyId]) ?? { html: "<p></p>", json: null };
  const setDraft = useCommentDraftStore((s) => s.set);
  const clearDraft = useCommentDraftStore((s) => s.clear);

  const { data: comments } = useStoryComments(workspaceSlug, projectId, storyId);
  const { data: projectMembers } = useProjectMembers(workspaceSlug, projectId);
  const createComment = useCreateStoryComment(workspaceSlug, projectId, storyId);

  const mentionMembers = (projectMembers ?? []).map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
  }));

  const recent = (comments ?? []).slice(0, RECENT_LIMIT);
  const hidden = (comments?.length ?? 0) - recent.length;

  const submit = () => {
    if (isEditorHtmlEmpty(draft.html)) return;
    // Posting only HTML would leave the comment with no canonical copy — the
    // backend has no HTML parser on the write path by design (ADR 0001).
    createComment.mutate(
      draft.json
        ? { body: JSON.stringify(draft.json), content_format: "json" }
        : { body: draft.html },
      { onSuccess: () => clearDraft(storyId) },
    );
  };

  return (
    <section className="space-y-3 border-t border-border/60 pt-5">
      <CommentComposer
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        members={mentionMembers}
        value={draft.html}
        onChange={(html, json) => setDraft(storyId, { html, json })}
        onSubmit={submit}
        isPending={createComment.isPending}
      />

      {recent.length ? (
        <ul className="space-y-4">
          {recent.map((c) => (
            <li key={c.id} className="flex gap-3 text-sm">
              <Avatar name={c.author_name} src={c.author_avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{c.author_name}</p>
                <CommentBody body={c.body} members={mentionMembers} />
                <time dateTime={c.created_at} className="text-xs text-muted-foreground">
                  {formatTimestamp(c.created_at)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground active:scale-[0.97]"
        onClick={() => onGoToTab("activity")}
      >
        {hidden > 0 ? `View all activity · ${hidden} more comment${hidden === 1 ? "" : "s"}` : "View all activity"}
      </Button>
    </section>
  );
}
