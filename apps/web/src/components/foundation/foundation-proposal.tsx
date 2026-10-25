"use client";

import { Button } from "@/components/ui/button";
import { FOUNDATION_PRESETS } from "@/constants/foundation-presets";
import { useReviewChange } from "@/hooks/project/use-foundation";
import type { IFoundation } from "@/types/project/foundation";

/** Pending proposed-change banner on the living Foundation page (GIN-196):
 * review the proposal, then approve (re-lock, versioned) or reject. */
export function FoundationProposal({
  workspaceSlug,
  projectId,
  foundation,
}: {
  workspaceSlug: string;
  projectId: string;
  foundation: IFoundation;
}) {
  const approve = useReviewChange(workspaceSlug, projectId, "approve");
  const reject = useReviewChange(workspaceSlug, projectId, "reject");
  const pending = foundation.pending_change;
  if (!pending) return null;

  const p = pending.payload;
  const label = p.preset_key
    ? (FOUNDATION_PRESETS.find((x) => x.key === p.preset_key)?.label ?? p.preset_key)
    : "Custom stack";
  const busy = approve.isPending || reject.isPending;

  return (
    <section className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
          Proposed change · pending review
        </span>
        <span className="text-xs text-muted-foreground">by {pending.proposed_by}</span>
      </div>
      <p className="text-sm text-foreground">
        Change the stack to <span className="font-medium">{label}</span>
        {p.allowed_libraries?.length ? ` (${p.allowed_libraries.length} libraries)` : ""}
        {p.database ? ` · ${p.database}${p.architecture ? `/${p.architecture}` : ""}` : ""}.
      </p>
      <p className="text-xs text-muted-foreground">
        Approving re-locks the Foundation as v{foundation.version + 1}; the current v
        {foundation.version} moves to history and downstream enforcement switches immediately.
      </p>
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => approve.mutate()}
          className="transition-transform duration-100 active:scale-[0.98]"
        >
          {approve.isPending ? "Approving…" : "Approve & re-lock"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => reject.mutate()}
          className="transition-transform duration-100 active:scale-[0.98]"
        >
          Reject
        </Button>
      </div>
    </section>
  );
}
