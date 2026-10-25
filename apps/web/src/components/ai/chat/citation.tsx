"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { parseCitationHref, type CitationSpec } from "@/lib/chat/citation";
import { useCitationContext } from "./citation-context";
import { RepoCodeSnippet } from "@/components/projects/github/repo-code-snippet";
import { useDocuments } from "@/hooks/docs/use-documents";
import { cn } from "@/lib/utils";

// Non-interactive fallback chip: same footprint as the inline `code` chip
// (chat-markdown-components.tsx) so an unresolvable citation still reads as
// "this was code/a reference", just not clickable.
const CHIP = "rounded-[5px] bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]";
// Interactive pill: same shape, but a hairline border + tinted surface signal
// "clickable" at a glance, distinct from the plain inline-code chip.
const PILL =
  "rounded-[5px] border border-border/70 bg-foreground/[0.06] px-1 py-0.5 font-mono text-[0.85em] transition-[color,background-color,border-color,transform] duration-150 ease-out";

export function Citation({ href, children }: { href?: string; children?: React.ReactNode }) {
  const spec = href ? parseCitationHref(href) : null;
  if (!spec) return <span className={CHIP}>{children}</span>;
  if (spec.kind === "code") return <CodeCitation spec={spec} label={children} />;
  return <DocCitation title={spec.title} label={children} />;
}

function CodeCitation({
  spec,
  label,
}: {
  spec: Extract<CitationSpec, { kind: "code" }>;
  label: React.ReactNode;
}) {
  const { workspaceSlug, projectId } = useCitationContext();
  const [open, setOpen] = useState(false);
  // Lazy-mount the snippet on first open, then keep it mounted so re-collapsing
  // animates smoothly instead of the content vanishing mid-transition.
  const [mounted, setMounted] = useState(false);

  if (!projectId) return <span className={CHIP}>{label}</span>;

  return (
    <span className="inline">
      <button
        type="button"
        aria-label={`${open ? "Hide" : "Show"} code ${spec.path}:${spec.start}-${spec.end}`}
        aria-expanded={open}
        onClick={() => {
          setMounted(true);
          setOpen((o) => !o);
        }}
        className={cn(
          PILL,
          "cursor-pointer align-baseline hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "active:scale-[0.97]",
          open && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        {label}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn(
            "ml-0.5 inline size-2.5 shrink-0 align-middle transition-transform duration-150 ease-out",
            open && "-rotate-180",
          )}
        />
      </button>
      {/* transitions.dev-style grid-rows reveal: animates from the collapsed
          track to the snippet's intrinsic height without knowing it up front
          (the snippet's height varies with the line range). */}
      <span
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <span className="block min-h-0 overflow-hidden">
          {mounted && (
            <RepoCodeSnippet
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              path={spec.path}
              startLine={spec.start}
              endLine={spec.end}
            />
          )}
        </span>
      </span>
    </span>
  );
}

function DocCitation({ title, label }: { title: string; label: React.ReactNode }) {
  const { workspaceSlug, projectId } = useCitationContext();
  const { data: docs } = useDocuments(workspaceSlug);
  const match = (docs ?? []).find(
    (d) => d.title === title && (!projectId || d.project_id === projectId),
  );
  if (!match) return <span className={CHIP}>{label}</span>;
  return (
    <Link
      href={`/${workspaceSlug}/docs/${match.id}`}
      className={cn(
        PILL,
        "text-primary align-baseline hover:border-primary/40 hover:bg-primary/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      )}
    >
      {label}
    </Link>
  );
}
