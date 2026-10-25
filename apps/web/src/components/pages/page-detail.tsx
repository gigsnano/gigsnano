"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import { RichEditor } from "@/components/editor";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { MobileHeader } from "@/components/layout/mobile-header";
import { useAuthUser } from "@/hooks/auth/use-auth";
import { usePage, usePagePresence, useUpdatePage } from "@/hooks/docs/use-pages";
import { looksLikeHtml, pageContentHtml } from "@/lib/docs/page-content";
import { editingAdvisory, otherViewers } from "@/lib/docs/page-presence";
import { SimpleMarkdown } from "@/lib/docs/simple-markdown";
import { APIError } from "@/services/api-error";
import type { IMemberPreview, IUpdatePagePayload } from "@/types";

import { PageActionsMenu } from "./page-actions-menu";

const field =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Read-only RichEditor still requires an onChange; it never fires when not editable. */
const noop = () => {};

export function PageDetail({
  workspaceSlug,
  projectId,
  pageId,
}: {
  workspaceSlug: string;
  projectId: string;
  pageId: string;
}) {
  const { data: page, isPending, isError, refetch } = usePage(workspaceSlug, projectId, pageId);
  const update = useUpdatePage(workspaceSlug, projectId, pageId);
  const { data: self } = useAuthUser();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  // Seed HTML for RichEditor on Edit / Reload; live edits live in refs only.
  const [contentSeed, setContentSeed] = useState("");
  const latestHtmlRef = useRef("");
  const latestJsonRef = useRef<Record<string, unknown> | null>(null);
  const contentChangedRef = useRef(false);
  // Never rendered, only read in handlers -- a ref avoids a pointless re-render
  // on every heartbeat/reload (react-doctor: rerender-state-only-in-handlers).
  const loadedUpdatedAtRef = useRef("");
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);

  // Presence v1 (GIN-24): who else is here, and a soft "X is editing" advisory
  // before the last-write-wins Save actually clobbers anything.
  const { data: presence } = usePagePresence(workspaceSlug, projectId, pageId, editing);
  const others = otherViewers(presence?.viewers ?? [], self?.id);
  const otherMembers: IMemberPreview[] = others.map((v) => ({
    id: v.user_id,
    display_name: v.display_name,
    avatar_url: v.avatar_url,
  }));
  const advisory = editingAdvisory(presence?.viewers ?? [], self?.id);

  const resetContentRefs = (content: string) => {
    setContentSeed(content);
    latestHtmlRef.current = content;
    latestJsonRef.current = null;
    contentChangedRef.current = false;
  };

  const startEdit = () => {
    if (!page) return;
    setTitle(page.title);
    // The editor only speaks HTML — a legacy markdown body must be rendered
    // first or its syntax is typed back in as literal text on the next save.
    resetContentRefs(pageContentHtml(page.content));
    loadedUpdatedAtRef.current = page.updated_at;
    setEditing(true);
    setSaved(false);
    setConflict(false);
  };

  const onSave = async () => {
    const payload: IUpdatePagePayload = {
      title: title.trim(),
      if_updated_at: loadedUpdatedAtRef.current,
    };
    // Title-only / no-op content saves must omit content — an HTML-only PATCH
    // clears the backend's canonical JSON (ADR 0001 / no HTML write parser).
    if (contentChangedRef.current) {
      if (latestJsonRef.current) {
        payload.content = JSON.stringify(latestJsonRef.current);
        payload.content_format = "json";
      } else {
        payload.content = latestHtmlRef.current;
      }
    }
    try {
      await update.mutateAsync(payload);
    } catch (err) {
      if (err instanceof APIError && err.status === 409) {
        setConflict(true);
        return;
      }
      throw err;
    }
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const onReloadAfterConflict = async () => {
    const res = await refetch();
    if (res.data) {
      setTitle(res.data.title);
      resetContentRefs(pageContentHtml(res.data.content));
      loadedUpdatedAtRef.current = res.data.updated_at;
    }
    setConflict(false);
  };

  const base = `/${workspaceSlug}/projects/${projectId}`;

  if (isPending) {
    return (
      <SkeletonReveal
        isLoading
        className="m-6 min-h-96"
        skeleton={<div className="size-full rounded-lg border bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  if (isError || !page) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Page not found"
          description="This page doesn't exist or was removed."
          actions={[
            { label: "All pages", href: `${base}/pages` },
            { label: "Retry", onClick: () => refetch() },
          ]}
        />
      </div>
    );
  }

  return (
    <>
      <MobileHeader backHref={`${base}/pages`} title={page.title} />
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link href={`${base}/pages`} className="text-sm text-muted-foreground hover:text-foreground">
            ← All pages
          </Link>
          <div className="flex items-center gap-2">
            {otherMembers.length > 0 ? (
              <AvatarGroup members={otherMembers} size="xs" max={4} />
            ) : null}
            {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="active:scale-[0.97]" disabled={update.isPending} onClick={onSave}>
                  {update.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" className="active:scale-[0.97]" onClick={startEdit}>
                  Edit
                </Button>
                <PageActionsMenu page={page} workspaceSlug={workspaceSlug} projectId={projectId} />
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            {conflict ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
              >
                <span>This page was changed by someone else. Reload to see the latest version.</span>
                <Button size="sm" variant="outline" onClick={onReloadAfterConflict}>
                  Reload
                </Button>
              </div>
            ) : advisory ? (
              <div
                role="status"
                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
              >
                {advisory}
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label id="page-edit-title-label" htmlFor="page-edit-title">Title</Label>
              <input
                id="page-edit-title"
                aria-labelledby="page-edit-title-label"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={field}
              />
            </div>
            <div
              className="flex flex-col gap-1.5"
              role="group"
              aria-labelledby="page-edit-content-label"
            >
              <span
                id="page-edit-content-label"
                className="text-sm leading-none font-medium select-none"
              >
                Content
              </span>
              <RichEditor
                value={contentSeed}
                onChange={(html, json) => {
                  latestHtmlRef.current = html;
                  latestJsonRef.current = json;
                  contentChangedRef.current = true;
                }}
                placeholder="Write the page, press '/' for commands…"
              />
            </div>
          </div>
        ) : (
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <h1>{page.title}</h1>
            {looksLikeHtml(page.content) ? (
              <RichEditor value={page.content} onChange={noop} editable={false} />
            ) : (
              <SimpleMarkdown text={page.content} />
            )}
          </article>
        )}
      </div>
    </>
  );
}
