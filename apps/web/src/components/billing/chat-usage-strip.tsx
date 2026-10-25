"use client";

import { CostPill } from "@/components/billing/cost-pill";
import { UsageBreakdown } from "@/components/billing/usage-breakdown";
import { useThreadUsage } from "@/hooks/billing/use-ai-usage";
import { RECEIPT_DISPLAY_FLOOR_CENTS } from "@/lib/ai-cost/constants";

/**
 * Calm per-thread receipt: last turn (if above the display floor) + running total.
 * No mid-stream animation — the parent invalidates the query on turn finish, and
 * the new value fades in via CostPill's color transition.
 *
 * The last-turn pill carries a breakdown on hover (operation/model/tokens) so
 * "why that much?" is answerable without leaving the chat (GIN-153).
 */
export function ChatUsageStrip({
  slug,
  projectId,
  storyId,
  threadId,
}: {
  slug: string;
  projectId: string;
  storyId: string;
  threadId: string;
}) {
  const { data } = useThreadUsage(slug, projectId, storyId, threadId);
  if (!data || data.total_cost_cents <= 0) return null;

  const last = data.lines[data.lines.length - 1];
  const showLast = last && last.cost_cents >= RECEIPT_DISPLAY_FLOOR_CENTS;

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {showLast ? (
        <>
          <span>Last reply</span>
          <UsageBreakdown line={last}>
            <CostPill cents={last.cost_cents} variant="cost" />
          </UsageBreakdown>
          <span aria-hidden>·</span>
        </>
      ) : null}
      <span>This thread</span>
      <CostPill cents={data.total_cost_cents} variant="cost" />
    </div>
  );
}
