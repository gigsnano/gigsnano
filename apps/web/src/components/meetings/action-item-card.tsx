"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TypeField } from "@/components/board/story/create/type-field";
import { TypeGlyph } from "@/components/issues/shared/type-glyph";
import {
  useApproveActionItem,
  useDismissActionItem,
  useUpdateActionItem,
} from "@/hooks/meetings/use-meetings";
import { cn } from "@/lib/utils";
import { EStoryType, type ID, type IMeetingActionItem, type IProjectMember, type TActionItemType } from "@/types";

/** Only these four types are ever LLM-assigned or reviewer-selectable — never Epic. */
const ACTION_ITEM_TYPES: EStoryType[] = [
  EStoryType.Task,
  EStoryType.Feature,
  EStoryType.Bug,
  EStoryType.Story,
];

/**
 * `IMeetingActionItem.type` (`TActionItemType`) and `EStoryType` share the same
 * four string values by contract (see `common.md`'s API section) — this cast
 * is the single seam between them, never a runtime conversion.
 */
function asStoryType(type: TActionItemType): EStoryType {
  return type as unknown as EStoryType;
}
function asActionItemType(type: EStoryType): TActionItemType {
  return type as unknown as TActionItemType;
}

/**
 * Local draft state that stays in sync with an external value without a
 * synchronous effect — React's documented "adjust state during render"
 * pattern (compare against the last-seen prop, reset on mismatch).
 */
function useDraftField(value: string) {
  const [draft, setDraft] = useState(value);
  const [lastSeen, setLastSeen] = useState(value);
  if (value !== lastSeen) {
    setLastSeen(value);
    setDraft(value);
  }
  return [draft, setDraft] as const;
}

/**
 * One action item: an editable review card while pending, collapsing into a
 * single summary row once approved or dismissed. Both states stay mounted
 * (transitions-dev card-resize, `grid-template-rows` 1fr → 0fr) so the
 * decision animates instead of popping; the hidden state is also `inert` so
 * it drops out of tab order and never intercepts a click while invisible.
 */
export function ActionItemCard({
  workspaceSlug,
  projectId,
  meetingId,
  item,
  members,
}: {
  workspaceSlug: string;
  projectId: string;
  meetingId: string;
  item: IMeetingActionItem;
  members: IProjectMember[];
}) {
  const decided = item.status !== "pending";

  return (
    <div className="rounded-lg border">
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          decided ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="overflow-hidden" inert={decided}>
          <PendingCardBody
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            meetingId={meetingId}
            item={item}
            members={members}
          />
        </div>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          decided ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden" inert={!decided}>
          <DecidedRow workspaceSlug={workspaceSlug} projectId={projectId} item={item} />
        </div>
      </div>
    </div>
  );
}

function PendingCardBody({
  workspaceSlug,
  projectId,
  meetingId,
  item,
  members,
}: {
  workspaceSlug: string;
  projectId: string;
  meetingId: string;
  item: IMeetingActionItem;
  members: IProjectMember[];
}) {
  const update = useUpdateActionItem(workspaceSlug, projectId, meetingId);
  const approve = useApproveActionItem(workspaceSlug, projectId, meetingId);
  const dismiss = useDismissActionItem(workspaceSlug, projectId, meetingId);
  const [title, setTitle] = useDraftField(item.title);
  const [description, setDescription] = useDraftField(item.description);
  const busy = approve.isPending || dismiss.isPending;
  // Escape reverts the draft and blurs, which fires onBlur synchronously —
  // without this guard commitTitle would read the just-reverted (but not yet
  // re-rendered) DOM value and PATCH the discarded text. Set right before the
  // synchronous blur(), consumed once at the top of the next commit. A ref is
  // fine here — it's only ever read/written from event handlers, never render.
  const skipNextTitleCommit = useRef(false);

  const commitTitle = () => {
    if (skipNextTitleCommit.current) {
      skipNextTitleCommit.current = false;
      return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(item.title);
      return;
    }
    if (trimmed !== item.title) {
      update.mutate({ id: item.id, payload: { title: trimmed } });
    }
  };

  const commitDescription = () => {
    if (description !== item.description) {
      update.mutate({ id: item.id, payload: { description } });
    }
  };

  return (
    <div className="space-y-3 p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            skipNextTitleCommit.current = true;
            setTitle(item.title);
            e.currentTarget.blur();
          }
        }}
        aria-label={`Title for "${item.title}"`}
        className="-mx-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium outline-none transition-colors hover:border-input focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      <div className="flex flex-wrap items-center gap-2">
        <TypeField
          value={asStoryType(item.type)}
          onChange={(t) => update.mutate({ id: item.id, payload: { type: asActionItemType(t) } })}
          allowedTypes={ACTION_ITEM_TYPES}
          aria-label={`Type for "${item.title}"`}
        />
        <AssigneeField
          value={item.assignee_id}
          members={members}
          itemTitle={item.title}
          onChange={(assigneeId) => update.mutate({ id: item.id, payload: { assignee_id: assigneeId } })}
        />
        <input
          type="date"
          value={item.target_date ?? ""}
          onChange={(e) =>
            update.mutate({ id: item.id, payload: { target_date: e.target.value || null } })
          }
          aria-label={`Due date for "${item.title}"`}
          className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commitDescription}
        aria-label={`Description for "${item.title}"`}
        rows={2}
        className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      <blockquote className="border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground">
        &ldquo;{item.quote}&rdquo;
        {item.speaker_name ? <span className="not-italic"> — {item.speaker_name}</span> : null}
      </blockquote>

      <div className="flex items-center justify-end gap-2 pt-1">
        {update.isError || approve.isError || dismiss.isError ? (
          <span role="alert" className="mr-auto text-xs text-destructive">
            Something went wrong. Try again.
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => dismiss.mutate(item.id)}
          aria-label={`Dismiss "${item.title}"`}
        >
          {dismiss.isPending ? "Dismissing…" : "Dismiss"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => approve.mutate(item.id)}
          aria-label={`Approve "${item.title}"`}
        >
          {approve.isPending ? "Approving…" : "Approve"}
        </Button>
      </div>
    </div>
  );
}

function DecidedRow({
  workspaceSlug,
  projectId,
  item,
}: {
  workspaceSlug: string;
  projectId: string;
  item: IMeetingActionItem;
}) {
  const dismissed = item.status === "dismissed";
  return (
    <div className="flex items-center gap-2 p-3 text-sm">
      <TypeGlyph type={asStoryType(item.type)} className={cn("size-4", dismissed && "opacity-50")} />
      <span className={cn("flex-1 truncate", dismissed && "text-muted-foreground line-through")}>
        {item.title}
      </span>
      {dismissed ? (
        <span className="shrink-0 text-xs text-muted-foreground">Dismissed</span>
      ) : item.created_story_id ? (
        <Link
          href={`/${workspaceSlug}/projects/${projectId}/issues/${item.created_story_id}`}
          className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Created
          <span aria-hidden className="ml-0.5">
            →
          </span>
        </Link>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">Created</span>
      )}
    </div>
  );
}

/** Compact assignee picker over the project's members, controlled by id. */
function AssigneeField({
  value,
  members,
  itemTitle,
  onChange,
}: {
  value: ID | null;
  members: IProjectMember[];
  itemTitle: string;
  onChange: (id: ID | null) => void;
}) {
  const current = members.find((m) => m.user_id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          current
            ? `Assignee for "${itemTitle}": ${current.display_name}`
            : `Assign an owner for "${itemTitle}"`
        }
        className="flex items-center gap-1.5 rounded-full border border-dashed border-input px-2 py-1 text-xs transition-colors hover:border-solid hover:bg-muted"
      >
        {current ? (
          <Avatar name={current.display_name} src={current.avatar_url} size="xs" />
        ) : (
          <HugeiconsIcon icon={UserAdd01Icon} className="size-3.5 text-muted-foreground" />
        )}
        <span className={cn(!current && "text-muted-foreground")}>
          {current ? current.display_name : "Assign"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {value ? (
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <span className="flex size-5 items-center justify-center rounded-full border border-dashed" />
            <span className="flex-1 text-muted-foreground">Unassigned</span>
          </DropdownMenuItem>
        ) : null}
        {members.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">No project members yet.</div>
        ) : (
          members.map((m) => (
            <DropdownMenuItem key={m.user_id} onSelect={() => onChange(m.user_id)}>
              <Avatar name={m.display_name} src={m.avatar_url} size="xs" />
              <span className="flex-1 truncate">{m.display_name}</span>
              {value === m.user_id ? (
                <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
