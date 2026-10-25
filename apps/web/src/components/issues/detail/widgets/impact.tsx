"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Cancel01Icon, SourceCodeIcon } from "@hugeicons/core-free-icons";

import { GroundedBadge } from "@/components/ai/grounded-badge";
import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { STORY_STATUS_META } from "@/constants/story-meta";
import { useStoryImpact } from "@/hooks/story/use-story-detail";
import { useUpdateStory } from "@/hooks/story/use-stories";
import { cn } from "@/lib/utils";
import type { IStoryImpactRisk } from "@/types/story/story-detail";

/** Backend `reason` for a child edge (kept in step with impact.py `_related_items`). */
const SUB_ITEM_REASON = "sub-item";

/** Relationship label for display ("blocked_by" → "blocked by", "sub-item" → "sub item"). */
function prettyReason(reason: string): string {
  return reason.replace(/[_-]/g, " ");
}

const RISK_SEGMENTS: Record<IStoryImpactRisk["level"], number> = { low: 1, medium: 3, high: 5 };
const RISK_TEXT: Record<IStoryImpactRisk["level"], string> = {
  low: "text-muted-foreground",
  medium: "text-foreground",
  high: "text-destructive",
};

export function IssueImpact({
  storyId,
  workspaceSlug,
  projectId,
  onOpenStory,
}: {
  storyId: string;
  workspaceSlug: string;
  projectId: string;
  /** Peek a related item in place (matches the old Sub-work items nav). Falls
   * back to full navigation via the link's href when absent. */
  onOpenStory?: (id: string) => void;
}) {
  const { data: impact } = useStoryImpact(workspaceSlug, projectId, storyId);
  const qc = useQueryClient();
  const updateStory = useUpdateStory(workspaceSlug, projectId);
  // Unlink a child from this parent (mirrors the Sub-work items section), then
  // refresh Impact so the row drops out — useUpdateStory doesn't touch this key.
  const unlinkFromParent = (childId: string) =>
    updateStory.mutate(
      { storyId: childId, patch: { parent_id: null } },
      {
        onSuccess: () =>
          qc.invalidateQueries({ queryKey: ["story-impact", workspaceSlug, projectId, storyId] }),
      },
    );

  if (!impact) return null;

  const { affected_files, related_items, risk } = impact;
  if (affected_files.length === 0 && related_items.length === 0) return null;

  const filled = RISK_SEGMENTS[risk.level] ?? 1;

  return (
    <IssueCollapsibleSection
      title="Impact"
      defaultOpen
      action={<GroundedBadge citationCount={impact.citations.length} />}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2" title={risk.rationale}>
          <div className="flex gap-0.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-4 rounded-full transition-colors",
                  i < filled
                    ? risk.level === "high"
                      ? "bg-destructive"
                      : "bg-foreground"
                    : "bg-muted",
                )}
              />
            ))}
          </div>
          <span className={cn("text-xs font-medium capitalize", RISK_TEXT[risk.level])}>
            {risk.level} risk
          </span>
        </div>

        {affected_files.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Affected code</p>
            <ul className="space-y-0.5">
              {affected_files.map((f, i) => (
                <li
                  key={f}
                  className="flex items-center gap-2 rounded-md px-1 py-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-1 motion-safe:duration-200"
                  style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
                >
                  <HugeiconsIcon icon={SourceCodeIcon} className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {related_items.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Related items</p>
            <ul className="space-y-0.5">
              {related_items.map((r, i) => {
                // Guard against an older API (or an unknown status) that omits it —
                // the widget degrades to code/title/reason instead of crashing.
                const meta = r.status ? STORY_STATUS_META[r.status] : undefined;
                const isSub = r.reason === SUB_ITEM_REASON;
                return (
                  <li
                    key={r.code}
                    className="group flex items-center rounded-md pr-1 transition-colors hover:bg-accent/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-1 motion-safe:duration-200"
                    style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
                  >
                    <Link
                      href={`/${workspaceSlug}/projects/${projectId}/issues/${r.id}`}
                      onClick={
                        onOpenStory
                          ? (e) => {
                              // Peek in place (same as the old Sub-work items nav);
                              // Ctrl/Cmd/middle-click still opens the real href.
                              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                              e.preventDefault();
                              onOpenStory(r.id);
                            }
                          : undefined
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      {meta ? <StatusIcon status={r.status} className="size-3.5" /> : null}
                      <span className="shrink-0 text-sm font-medium text-foreground">{r.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {r.title}
                      </span>
                      {meta ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            meta.chip,
                          )}
                        >
                          {meta.label}
                        </span>
                      ) : null}
                      <span
                        className="shrink-0 text-[11px] capitalize text-muted-foreground"
                        title={`Relationship: ${prettyReason(r.reason)}`}
                      >
                        {prettyReason(r.reason)}
                      </span>
                    </Link>
                    {isSub ? (
                      <button
                        type="button"
                        aria-label={`Remove ${r.code} from parent`}
                        disabled={updateStory.isPending}
                        onClick={() => unlinkFromParent(r.id)}
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                      </button>
                    ) : (
                      <span className="flex size-6 shrink-0 items-center justify-center">
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="size-3.5 text-muted-foreground opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:opacity-100"
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Link
          href={`/${workspaceSlug}/projects/${projectId}/codebase`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Open Codebase Intelligence
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </Link>
      </div>
    </IssueCollapsibleSection>
  );
}
