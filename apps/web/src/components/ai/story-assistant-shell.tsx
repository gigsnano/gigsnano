"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, File01Icon } from "@hugeicons/core-free-icons";

import { StoryChat } from "@/components/board";
import { useProjectDocuments } from "@/hooks/docs/use-documents";
import { cn } from "@/lib/utils";
import type { IDocument, IStory } from "@/types";

export function StoryAssistantShell({
  story,
  workspaceSlug,
  projectId,
  onBack,
  referencedDocIds,
  onReferencedDocIdsChange,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  onBack: () => void;
  referencedDocIds?: string[];
  onReferencedDocIdsChange?: (ids: string[]) => void;
}) {
  const { data: docs } = useProjectDocuments(workspaceSlug, projectId);
  const [localRefIds, setLocalRefIds] = useState<string[]>(referencedDocIds ?? []);
  const refIds = referencedDocIds ?? localRefIds;
  const setRefIds = onReferencedDocIdsChange ?? setLocalRefIds;

  const toggleReference = (doc: IDocument) => {
    if (refIds.includes(doc.id)) {
      setRefIds(refIds.filter((id) => id !== doc.id));
    } else {
      setRefIds([...refIds, doc.id]);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.97]"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          Back to detail
        </button>
        <span className="min-w-0 truncate text-sm font-medium">{story.title}</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className="shrink-0 border-b bg-muted/30 p-3 md:w-56 md:border-b-0 md:border-r"
          aria-live="polite"
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Project documents
          </p>
          {!docs?.length ? (
            <p className="text-xs text-muted-foreground">
              Documents generated across this project&apos;s tasks will appear here to
              reference in chat.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0">
              {docs.map((doc) => {
                const active = refIds.includes(doc.id);
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => toggleReference(doc)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs transition-colors duration-150 ease-out active:scale-[0.97]",
                      active
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <HugeiconsIcon icon={File01Icon} className="size-3.5 shrink-0" />
                    <span className="max-w-[140px] truncate">{doc.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <StoryChat
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            referencedDocIds={refIds}
            onReferencedDocIdsChange={setRefIds}
            storyDocuments={docs ?? []}
          />
        </div>
      </div>
    </div>
  );
}
