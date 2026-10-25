"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon } from "@hugeicons/core-free-icons";

import { useWorkspaceFile } from "@/hooks/project/use-projects";
import { highlightWorkspaceCodeRange } from "@/lib/workspace/shiki-highlight";
import { cn } from "@/lib/utils";

import "./repo-code-snippet.css";

interface RepoCodeSnippetProps {
  workspaceSlug: string;
  projectId: string;
  path: string;
  startLine: number;
  endLine: number;
}

/**
 * Inline shiki-highlighted line-range peek for a repo citation
 * (`#gigs-cite:file:...`). Sits inside a chat message: compact, never
 * throws -- a missing file, an unhighlightable grammar, or a fetch error
 * all resolve to the same graceful inline notice.
 */
export function RepoCodeSnippet({
  workspaceSlug,
  projectId,
  path,
  startLine,
  endLine,
}: RepoCodeSnippetProps) {
  const { data, isLoading, isError } = useWorkspaceFile(workspaceSlug, projectId, path);
  const [html, setHtml] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);

  // Re-highlights whenever the resolved file content or the requested range
  // changes. The `alive` guard drops a stale async result if the citation
  // (path/range) changes, or the component unmounts, before it resolves.
  useEffect(() => {
    if (typeof data?.content !== "string") return;
    let alive = true;
    highlightWorkspaceCodeRange(data.content, path, startLine, endLine)
      .then((result) => {
        if (!alive) return;
        setHtml(result.html);
        setTruncated(result.truncated);
        setFailed(result.html === null);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [data?.content, path, startLine, endLine]);

  const missing = !isLoading && (isError || typeof data?.content !== "string");
  const pending = isLoading || (!missing && !failed && html === null);

  if (missing || failed) {
    return (
      <span className="my-1.5 block rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Couldn&apos;t load this snippet.
      </span>
    );
  }

  // `span` (not `figure`/`figcaption`/`div`) throughout: this component mounts
  // inline in chat prose, frequently as a descendant of a markdown `<p>`.
  // `<span>` is phrasing content so it stays HTML5-valid inside `<p>`; the
  // block-ish layout comes entirely from Tailwind's `block` utility.
  return (
    <span className="my-1.5 block overflow-hidden rounded-lg border border-border/60 bg-foreground/[0.06]">
      <span className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
        <HugeiconsIcon icon={File01Icon} className="size-3 shrink-0" />
        <span className="truncate font-mono">{path}</span>
        <span className="shrink-0 font-mono text-muted-foreground/70">
          {startLine}-{endLine}
        </span>
      </span>
      {/* Hand-inlined equivalent of <SkeletonReveal> (transitions.dev #14, same
          `.t-skel*` classes) using `<span>` instead of that shared component's
          `<div>`s -- this whole subtree can land inside a markdown `<p>`, and
          `<span>` is the only block-level-styled tag that stays phrasing
          content there. */}
      <span className={cn("t-skel", !pending && "is-revealed")}>
        <span className="t-skel-skeleton is-pulsing">
          <span className="block h-16 animate-pulse bg-muted/60" />
        </span>
        <span className="t-skel-content">
          <span
            className="gn-snippet block overflow-x-auto whitespace-pre px-3 py-2 text-[0.8em] leading-relaxed"
            style={{ ["--snippet-start" as string]: String(startLine) }}
            // Shiki emits sanitized HTML for known grammars only.
            dangerouslySetInnerHTML={{ __html: html ?? "" }}
          />
        </span>
      </span>
      {truncated && (
        <span className="block border-t border-border/50 px-3 py-1 text-[11px] text-muted-foreground">
          Truncated to 200 lines.
        </span>
      )}
    </span>
  );
}
