"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { StoryAssistantShell } from "@/components/ai/story-assistant-shell";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useStory } from "@/hooks/story/use-stories";
import { IssueDocumentPeek } from "@/components/issues/detail";
import { IssueDetailPanel } from "./issue-detail-panel";

/**
 * Universal work-item peek. Reads `?peek=<storyId>` from the URL and renders
 * the shared detail view in a right-side sheet. Optional `?assistant=1` and
 * `?doc=<docId>` for in-sheet navigation without losing context.
 */
export function IssuePeekSheet({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const storyId = params.get("peek");
  const assistant = params.get("assistant") === "1";
  const docId = params.get("doc");
  // Back trail of ancestor peeks (Jira-style "‹ Back"). Lives in the URL so it
  // survives re-renders and browser nav without any client-side stack to sync.
  const trail = (params.get("trail") ?? "").split(",").filter(Boolean);
  const story = useStory(workspaceSlug, projectId, storyId ?? "");

  const replaceParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const close = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("peek");
    next.delete("assistant");
    next.delete("doc");
    next.delete("trail");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  };

  const openStory = (id: string) => {
    if (id === storyId) return;
    // PUSH (not replace) so peeking a related item adds a history entry — browser
    // Back returns too — and record the current item on the trail so the in-sheet
    // "Back" button can return to it. Within-item sub-nav (doc/assistant) stays on
    // replace so it doesn't clutter history.
    const next = new URLSearchParams(params.toString());
    next.set("peek", id);
    if (storyId) next.set("trail", [...trail, storyId].join(","));
    next.delete("assistant");
    next.delete("doc");
    router.push(`?${next.toString()}`, { scroll: false });
  };

  const goBack = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    const rest = trail.slice(0, -1);
    const next = new URLSearchParams(params.toString());
    next.set("peek", prev);
    if (rest.length) next.set("trail", rest.join(","));
    else next.delete("trail");
    next.delete("assistant");
    next.delete("doc");
    router.push(`?${next.toString()}`, { scroll: false });
  };

  const openDocument = (id: string) => {
    replaceParams((next) => {
      next.set("doc", id);
      next.delete("assistant");
    });
  };

  const backFromAssistant = () => {
    replaceParams((next) => {
      next.delete("assistant");
    });
  };

  const backFromDocument = () => {
    replaceParams((next) => {
      next.delete("doc");
    });
  };

  const page = docId ? "3" : assistant ? "2" : "1";

  return (
    <Sheet
      open={Boolean(storyId)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent
        data-assistant={assistant || Boolean(docId) ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-0 border-l p-0 shadow-[-8px_0_24px_-4px_rgba(0,0,0,0.08)] transition-[max-width] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] sm:max-w-[50vw] sm:min-w-[28rem]",
          (assistant || docId) && "sm:max-w-[min(92vw,72rem)] lg:max-w-[min(92vw,72rem)]",
        )}
      >
        <SheetTitle className="sr-only">Work item detail</SheetTitle>
        {storyId && story.data ? (
          <div className="t-page-slide relative flex h-full min-h-0 flex-1 flex-col" data-page={page}>
            <section className="t-page flex min-h-0 flex-1 flex-col" data-page-id="1">
              <IssueDetailPanel
                story={story.data}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                cycleId={story.data.cycle_id ?? undefined}
                variant="peek"
                onClose={close}
                onBack={trail.length > 0 ? goBack : undefined}
                onOpenStory={openStory}
                onOpenDocument={openDocument}
              />
            </section>
            <section className="t-page flex min-h-0 flex-1 flex-col" data-page-id="2">
              <StoryAssistantShell
                story={story.data}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                onBack={backFromAssistant}
              />
            </section>
            <section className="t-page flex min-h-0 flex-1 flex-col" data-page-id="3">
              {docId ? (
                <IssueDocumentPeek
                  workspaceSlug={workspaceSlug}
                  documentId={docId}
                  onBack={backFromDocument}
                />
              ) : null}
            </section>
          </div>
        ) : storyId ? (
          <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
