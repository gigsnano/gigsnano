"use client";

import { CheckmarkCircle02Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import type { IDocumentPackage } from "@/types";

export function AnalyseStep({
  pkg,
  isAnalysing,
  error,
  onAnalyse,
  analysedIds,
}: {
  pkg: IDocumentPackage;
  isAnalysing: boolean;
  error: string | null;
  onAnalyse: () => void;
  /** Documents already read, so progress is real rather than a spinner that
   *  cannot tell you whether anything is happening. */
  analysedIds: string[];
}) {
  // Set, not repeated `includes`: this is checked once per document per render.
  const analysedSet = new Set(analysedIds);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-base font-medium text-foreground">Analyse the package</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reads the {pkg.counts.ready} readable {pkg.counts.ready === 1 ? "document" : "documents"}{" "}
          and extracts decisions, modules, phases, tasks, dependencies and gaps — each linked to the
          section it came from. Still nothing created in the project.
        </p>
      </header>

      {isAnalysing ? (
        // Per-document skeletons rather than one spinner: the work really is
        // per document, and seeing the shape of the result arrive reads faster
        // than a spinner of unknown length.
        <div className="flex flex-col gap-2" aria-live="polite" aria-busy="true">
          <p className="text-sm text-muted-foreground">
            Reading documents… {analysedIds.length} of {pkg.counts.ready} done
          </p>
          {pkg.documents.map((doc) => {
            const done = analysedSet.has(doc.id);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-md border px-3 py-2.5"
              >
                {done ? (
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    className="size-4 shrink-0 text-emerald-600"
                  />
                ) : (
                  <span className="size-4 shrink-0 animate-pulse rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {doc.file_name || doc.title}
                  </span>
                  {done ? (
                    <span className="text-xs text-muted-foreground">Read</span>
                  ) : (
                    <span className="mt-1 block h-2 w-2/3 animate-pulse rounded bg-muted" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-muted/30 px-5 py-6">
          <span className="flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
            <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          </span>
          <p className="text-sm text-muted-foreground">
            Analysis does not change anything. You review everything it finds before any work item
            is created, and you can run it again after correcting a document&apos;s type.
          </p>
          <Button type="button" onClick={onAnalyse}>
            Analyse {pkg.counts.ready} {pkg.counts.ready === 1 ? "document" : "documents"}
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
