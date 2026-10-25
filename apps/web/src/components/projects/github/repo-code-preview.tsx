"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon } from "@hugeicons/core-free-icons";

import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { SimpleMarkdown } from "@/lib/docs/simple-markdown";
import { languageFromPath, workspacePreviewKind } from "@/lib/workspace/file-preview";
import { cn } from "@/lib/utils";

import { PlainCodeBlock } from "./plain-code-block";
import { RepoShikiBlock } from "./repo-shiki-block";

function UnsupportedPreview({ path }: { path: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <HugeiconsIcon icon={File01Icon} className="size-7" />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">No preview for this file type</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-mono">{path.split("/").pop()}</span> cannot be rendered inline.
          Open it on GitHub or download it from your local clone.
        </p>
      </div>
    </div>
  );
}

function PreviewBody({ path, content }: { path: string; content: string }) {
  const kind = workspacePreviewKind(path);

  if (kind === "markdown") {
    return (
      <article
        className={cn(
          "t-repo-preview gn-prose prose prose-sm dark:prose-invert max-w-none overflow-auto px-5 py-4",
          "min-h-[280px]",
        )}
      >
        <SimpleMarkdown text={content} />
      </article>
    );
  }

  if (kind === "code") {
    return <RepoShikiBlock key={path} path={path} content={content} />;
  }

  if (kind === "text") {
    return (
      <div className="t-repo-preview flex min-h-0 flex-1 flex-col">
        <PlainCodeBlock content={content} />
      </div>
    );
  }

  return <UnsupportedPreview path={path} />;
}

export function RepoCodePreview({
  path,
  content,
  isLoading,
  isError,
  repoUrl,
  defaultBranch = "main",
}: {
  path: string | null;
  content: string | null;
  isLoading: boolean;
  isError: boolean;
  repoUrl: string;
  defaultBranch?: string;
}) {
  const language = path ? languageFromPath(path) : null;
  const githubFileUrl =
    path && repoUrl ? `${repoUrl}/blob/${defaultBranch}/${path}` : null;

  if (!path) {
    return (
      <div className="flex min-h-[280px] flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
        Select a file to preview its contents.
      </div>
    );
  }

  return (
    <div className="flex min-h-[280px] flex-1 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-mono text-xs text-foreground">{path}</p>
          {language ? (
            <span className="shrink-0 rounded-md border bg-background px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
              {language}
            </span>
          ) : null}
        </div>
        {githubFileUrl ? (
          <a
            href={githubFileUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs font-medium text-primary transition-colors hover:underline"
          >
            View on GitHub
          </a>
        ) : null}
      </div>

      <SkeletonReveal
        isLoading={isLoading}
        className="min-h-0 flex-1"
        skeleton={<div className="m-4 min-h-[240px] rounded-lg bg-muted" />}
      >
        {isError ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Couldn&apos;t load this file. Pick another file or try again.
          </p>
        ) : content != null ? (
          <PreviewBody key={path} path={path} content={content} />
        ) : null}
      </SkeletonReveal>
    </div>
  );
}
