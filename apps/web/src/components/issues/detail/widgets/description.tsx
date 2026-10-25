"use client";

import { useEffect, useRef, useState } from "react";

import { RichEditor } from "@/components/editor";
import { ContentOverflow } from "@/components/ui/content-overflow";
import { imageService } from "@/services/image.service";
import { storyWorkHref } from "@/lib/issues/issue-routes";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { useProjectStories, useUpdateStory } from "@/hooks/story/use-stories";
import type { IStory } from "@/types";

/** Debounce window for autosave — matches Plane's DescriptionInput (1500ms). */
const AUTOSAVE_DELAY = 1500;

/**
 * "Description" block for the work item detail view — a seamless RichEditor
 * bound to `story.description` with debounced autosave. Long descriptions are
 * collapsed behind a "Show all" gradient fade (Plane-style) until the reader
 * expands them or focuses the field to edit.
 *
 * Save semantics mirror Plane's `DescriptionInput` so a single edit session
 * results in one write, not one per keystroke pause:
 * - a change schedules a single debounced save (the timer resets while typing);
 * - a change whose HTML equals the last-saved value is ignored (no redundant
 *   PATCH, and therefore no redundant activity-log entry);
 * - on close (unmount) the pending timer is cancelled and, only if there are
 *   unsaved changes, one final save is flushed.
 *
 * The detail view remounts this component per story (`key={story.id}` on its
 * container), so switching work items unmounts-and-flushes the previous one and
 * mounts a fresh baseline — no cross-story re-sync effect is needed.
 */
export function IssueDescription({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  maxHeight = 224,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  /** Collapse threshold. The v2 Overview raises it so the core requirement is
   *  readable without pressing "Show all" (GIN-480). */
  maxHeight?: number;
}) {
  const updateStory = useUpdateStory(workspaceSlug, projectId, cycleId);
  const { data: projectMembers } = useProjectMembers(workspaceSlug, projectId);
  const mentionMembers = (projectMembers ?? []).map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
  }));

  // `#`-reference pool: the project's other work items that carry a code.
  const { data: projectStories } = useProjectStories(workspaceSlug, projectId);
  const workItems = (projectStories ?? []).reduce<{ id: string; code: string; title: string }[]>(
    (acc, s) => {
      if (s.id !== story.id && s.code) acc.push({ id: s.id, code: s.code, title: s.title });
      return acc;
    },
    [],
  );
  const resolveWorkItemHref = (id: string) => {
    const s = (projectStories ?? []).find((x) => x.id === id);
    return s ? storyWorkHref(workspaceSlug, s) : undefined;
  };
  const [editing, setEditing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Latest editor HTML, the last value we persisted, and whether they differ.
  const latestHtmlRef = useRef(story.description ?? "");
  // The canonical value that actually gets saved. HTML is still what the API
  // returns for rendering and what the change-detection compares, but a save
  // that sends only HTML *clears* the row's canonical copy — the backend has no
  // HTML parser on the write path by design (ADR 0001) — so the JSON is what
  // travels.
  const latestJsonRef = useRef<Record<string, unknown> | null>(null);
  const lastSavedRef = useRef(story.description ?? "");
  const hasUnsavedRef = useRef(false);

  // One place that performs the write, guarded so it only fires for real,
  // not-yet-saved changes. Held behind a ref so the unmount cleanup always
  // calls the latest closure (correct story id + mutation) without re-running.
  const saveNow = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!hasUnsavedRef.current || latestHtmlRef.current === lastSavedRef.current) return;
    lastSavedRef.current = latestHtmlRef.current;
    hasUnsavedRef.current = false;
    updateStory.mutate({
      storyId: story.id,
      patch: latestJsonRef.current
        ? {
            description: JSON.stringify(latestJsonRef.current),
            content_format: "json",
          }
        : // No JSON yet means nothing was edited through the editor this session;
          // fall back rather than send a description with no canonical form.
          { description: latestHtmlRef.current },
    });
  };
  const saveNowRef = useRef(saveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
  });

  // Flush once on close — Plane's save-on-unmount.
  useEffect(() => () => saveNowRef.current(), []);

  const handleChange = (html: string, json: Record<string, unknown>) => {
    // Ignore no-op changes (e.g. focus round-trips that re-emit the same HTML).
    if (html === lastSavedRef.current) return;
    latestHtmlRef.current = html;
    latestJsonRef.current = json;
    hasUnsavedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveNowRef.current(), AUTOSAVE_DELAY);
  };

  return (
    <section>
      <ContentOverflow maxHeight={maxHeight} forceExpanded={editing}>
        {/* Scope edit-detection to the editor only — not the "Show all" toggle
            that ContentOverflow renders as a sibling — so reading and expanding
            never get mistaken for editing. */}
        <div
          onFocus={() => setEditing(true)}
          onBlur={(e) => {
            // Stay expanded while focus moves within the editor (e.g. bubble menu).
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false);
          }}
        >
          <RichEditor
            value={story.description ?? ""}
            onChange={handleChange}
            mentionMembers={mentionMembers}
            workItems={workItems}
            resolveWorkItemHref={resolveWorkItemHref}
            onUploadImage={(file) => imageService.uploadImage(workspaceSlug, file, projectId)}
            placeholder="Write a description, press '/' for commands, @ to mention, # to link a work item…"
          />
        </div>
      </ContentOverflow>
    </section>
  );
}
