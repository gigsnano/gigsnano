"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { FileUploadIcon, SparklesIcon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

/** Section-scoped empty state — compact in peek, fuller on detail page. */
export function IssueDocumentsEmpty({
  variant,
  artifact,
  onUpload,
}: {
  variant: "peek" | "detail";
  artifact?: string;
  onUpload: () => void;
}) {
  const artifactHint = artifact
    ? `Generate ${artifact} with GigsAI above, or upload a reference file.`
    : "Upload reference files or generate artifacts with GigsAI.";

  if (variant === "peek") {
    return (
      <button
        type="button"
        onClick={onUpload}
        className={cn(
          "group w-full rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-3 text-left outline-none",
          "transition-[border-color,background-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          "hover:border-primary/30 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm",
              "transition-[color,background-color,transform] duration-200 ease-out",
              "group-hover:bg-primary/10 group-hover:text-primary",
            )}
          >
            <HugeiconsIcon icon={FileUploadIcon} className="size-4" />
          </span>
          <span className="t-texts is-shown min-w-0 flex-1">
            <span className="t-texts-line t-texts-line--1 block text-sm font-medium text-foreground">
              No documents yet
            </span>
            <span className="t-texts-line t-texts-line--2 mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {artifactHint}
            </span>
          </span>
        </div>
      </button>
    );
  }

  return (
    <EmptyState
      align="start"
      className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/10 px-5 py-8"
      asset={
        <span className="flex size-16 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
          <HugeiconsIcon icon={FileUploadIcon} className="size-7" />
        </span>
      }
      title="No documents yet"
      description={artifactHint}
      actions={[
        {
          label: "Upload document",
          onClick: onUpload,
          icon: <HugeiconsIcon icon={FileUploadIcon} className="size-4" />,
        },
      ]}
    />
  );
}

/** Inline hint when agent artifact is expected but not yet generated. */
export function ExpectedArtifactHint({ artifact }: { artifact: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
      <HugeiconsIcon icon={SparklesIcon} className="size-3 shrink-0 text-primary" />
      <span>
        Expected output:{" "}
        <span className="font-medium text-foreground">{artifact}</span>
      </span>
    </p>
  );
}
