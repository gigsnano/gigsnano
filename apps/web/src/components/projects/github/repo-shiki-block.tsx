"use client";

import { useEffect, useState } from "react";

import { highlightWorkspaceCode } from "@/lib/workspace/shiki-highlight";

import { PlainCodeBlock } from "./plain-code-block";

/** Shiki-powered code block with plain-text fallback for unknown grammars. */
export function RepoShikiBlock({ path, content }: { path: string; content: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [usePlain, setUsePlain] = useState(false);

  // The parent keys this component by `path`, so a file change remounts it and
  // resets state to its initial (pending) values — no synchronous resets here.
  useEffect(() => {
    let cancelled = false;

    highlightWorkspaceCode(content, path)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setHtml(result);
          setPending(false);
        } else {
          setUsePlain(true);
          setPending(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsePlain(true);
          setPending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, content]);

  if (pending) {
    return <div className="m-4 min-h-[240px] animate-pulse rounded-lg bg-muted" />;
  }

  if (usePlain || !html) {
    return (
      <div className="t-repo-preview flex min-h-0 flex-1 flex-col">
        <PlainCodeBlock content={content} />
      </div>
    );
  }

  return (
    <div
      className="t-repo-preview repo-shiki min-h-0 flex-1 overflow-auto"
      // Shiki emits sanitized HTML for known grammars only.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
