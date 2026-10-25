"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { formatTimestamp } from "@/lib/format/timestamp";
import { isEditorHtmlEmpty } from "@/lib/editor/is-html-empty";
import {
  useCreateStoryComment,
  useStoryComments,
  useStoryHistory,
} from "@/hooks/story/use-story-detail";
import { useUpdateStory } from "@/hooks/story/use-stories";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { cn } from "@/lib/utils";
import { useCommentDraftStore } from "@/store/ui/comment-draft.store";
import { EStoryActivityField, EStoryActivityKind, type IStoryComment } from "@/types";
import type { IUpdateStoryPayload } from "@/services/story/story.service";

import { CommentBody } from "@/components/issues/shared/comment-body";
import { CommentComposer } from "@/components/issues/shared/comment-composer";
import { HistoryDiff } from "@/components/issues/detail/widgets/history-diff";
import { RestoreConfirmDialog } from "@/components/issues/detail/dialogs/restore-confirm-dialog";
import { restorePatch, isRestorable } from "@/lib/issues/restore-field";

export type EActivityTab = "all" | "activity" | "comments" | "transition" | "history";

// Plane-style: show only the most recent few by default; "Show all" expands the rest.
const ACTIVITY_LIMIT = 5;

const TABS: { id: EActivityTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "activity", label: "Activity" },
  { id: "comments", label: "Comments" },
  { id: "transition", label: "Transition" },
  { id: "history", label: "History" },
];

function CommentRow({
  comment,
  members,
}: {
  comment: IStoryComment;
  members: { user_id: string; display_name: string }[];
}) {
  return (
    <li className="flex gap-3 text-sm">
      <Avatar name={comment.author_name} src={comment.author_avatar_url} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{comment.author_name}</p>
        <CommentBody body={comment.body} members={members} />
        <time dateTime={comment.created_at} className="text-xs text-muted-foreground">
          {formatTimestamp(comment.created_at)}
        </time>
      </div>
    </li>
  );
}

/** Plane-style activity feed with tabs and comment composer. */
export function IssueActivity({
  workspaceSlug,
  projectId,
  storyId,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
}) {
  const [tab, setTab] = useState<EActivityTab>("all");
  const [showAll, setShowAll] = useState(false);
  // The draft lives in a store, not local state, so it survives a tab change and
  // is the same text the Overview composer holds (GIN-480). `json` rides along
  // because posting only HTML would leave the comment with no canonical copy —
  // the backend has no HTML parser on the write path by design (ADR 0001).
  const draft = useCommentDraftStore((s) => s.drafts[storyId]) ?? { html: "<p></p>", json: null };
  const setDraft = useCommentDraftStore((s) => s.set);
  const clearDraft = useCommentDraftStore((s) => s.clear);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ field: EStoryActivityField; oldValue: string } | null>(
    null,
  );
  const { data: history } = useStoryHistory(workspaceSlug, projectId, storyId);
  const { data: comments } = useStoryComments(workspaceSlug, projectId, storyId);
  const { data: projectMembers } = useProjectMembers(workspaceSlug, projectId);
  const createComment = useCreateStoryComment(workspaceSlug, projectId, storyId);
  const updateStory = useUpdateStory(workspaceSlug, projectId);

  const mentionMembers = (projectMembers ?? []).map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
  }));

  const feed = (() => {
    const items = [
      ...(history ?? []).map((h) => ({
        id: h.id,
        at: h.created_at,
        actor: h.actor_name,
        text: h.summary,
        kind: h.kind,
        field: h.field,
        oldValue: h.old_value,
        newValue: h.new_value,
      })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  })();

  const showComments = tab === "all" || tab === "comments";
  const showFeed =
    tab === "all" ||
    tab === "activity" ||
    tab === "transition" ||
    tab === "history";

  const filteredFeed = (() => {
    if (tab === "comments") return [];
    if (tab === "transition") {
      return feed.filter((f) => f.field === EStoryActivityField.Status);
    }
    if (tab === "activity") {
      return feed.filter((f) => f.kind !== EStoryActivityKind.Comment);
    }
    return feed;
  })();

  // Collapse to the most recent few until the user expands (Plane-style).
  const visibleFeed = showAll ? filteredFeed : filteredFeed.slice(0, ACTIVITY_LIMIT);
  const hiddenCount = filteredFeed.length - visibleFeed.length;

  const submitComment = async () => {
    if (isEditorHtmlEmpty(draft.html)) return;
    await createComment.mutateAsync(
      draft.json
        ? { body: JSON.stringify(draft.json), content_format: "json" }
        : { body: draft.html },
    );
    clearDraft(storyId);
    setTab("comments");
  };

  return (
    <section className="mt-2 border-t pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setShowAll(false);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
                tab === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showComments ? (
        <div className="mb-4">
          <CommentComposer
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            members={mentionMembers}
            value={draft.html}
            onChange={(html, json) => setDraft(storyId, { html, json })}
            onSubmit={() => void submitComment()}
            isPending={createComment.isPending}
          />
        </div>
      ) : null}

      {showComments && (comments?.length ?? 0) > 0 ? (
        <ul className="mb-4 space-y-4">
          {(comments ?? []).map((c) => (
            <CommentRow key={c.id} comment={c} members={mentionMembers} />
          ))}
        </ul>
      ) : null}

      {showFeed ? (
        <ul className="space-y-4">
          {visibleFeed.map((item) => (
            <li key={item.id} className="flex gap-3 text-sm">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-border" />
              <div className="min-w-0">
                <p className="text-foreground">
                  <span className="font-medium">{item.actor}</span>{" "}
                  <span className="text-muted-foreground">{item.text}</span>
                </p>
                {item.oldValue != null ? (
                  <div className="mt-0.5">
                    <button
                      type="button"
                      onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))}
                      className="text-xs font-medium text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.97]"
                    >
                      {expandedId === item.id ? "Hide changes" : "View changes"}
                    </button>
                    {item.field && isRestorable(item.field) ? (
                      <button
                        type="button"
                        onClick={() => setRestore({ field: item.field!, oldValue: item.oldValue! })}
                        className="ml-3 text-xs font-medium text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.97]"
                      >
                        ↩ Restore
                      </button>
                    ) : null}
                    {expandedId === item.id ? (
                      <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out motion-reduce:animate-none">
                        <HistoryDiff
                          field={item.field}
                          oldValue={item.oldValue}
                          newValue={item.newValue ?? ""}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <time dateTime={item.at} className="text-xs text-muted-foreground">
                  {formatTimestamp(item.at)}
                </time>
              </div>
            </li>
          ))}
          {!filteredFeed.length ? (
            <li className="py-4 text-sm text-muted-foreground">No activity yet.</li>
          ) : null}
          {hiddenCount > 0 || showAll ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAll ? "Show less" : `Show all ${filteredFeed.length} activities`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {tab === "comments" && !comments?.length ? (
        <p className="py-4 text-sm text-muted-foreground">No comments yet.</p>
      ) : null}

      <RestoreConfirmDialog
        open={restore !== null}
        fieldLabel={restore?.field ?? ""}
        pending={updateStory.isPending}
        onOpenChange={(o) => !o && setRestore(null)}
        onConfirm={() => {
          if (!restore) return;
          const patch = restorePatch(restore.field, restore.oldValue);
          if (!patch) return setRestore(null);
          updateStory.mutate(
            { storyId, patch: patch as Partial<IUpdateStoryPayload> },
            { onSettled: () => setRestore(null) },
          );
        }}
      />
    </section>
  );
}
