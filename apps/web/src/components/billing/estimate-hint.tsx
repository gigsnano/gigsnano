"use client";

import Link from "next/link";

import { useWalletBalance } from "@/hooks/billing/use-wallet";
import { useCostEstimate } from "@/hooks/billing/use-ai-usage";
import { formatCostCents } from "@/lib/ai-cost/format";
import { formatCents } from "@/lib/format/money";
import { EAiOperation } from "@/types/billing/ai-cost";

/** Map a BMAD workflow slug to an estimatable operation (defaults to Finalize). */
export function bmadWorkflowToOperation(workflow?: string): EAiOperation {
  if (!workflow) return EAiOperation.Finalize;
  if (workflow.includes("prd")) return EAiOperation.Prd;
  if (workflow.includes("architecture")) return EAiOperation.Architecture;
  if (workflow.includes("epics") || workflow.includes("stories")) return EAiOperation.EpicsAndStories;
  if (workflow.includes("sprint-planning")) return EAiOperation.SprintPlanning;
  if (workflow.includes("brief")) return EAiOperation.ProjectBrief;
  if (workflow.includes("ux")) return EAiOperation.Ux;
  return EAiOperation.Finalize;
}

/**
 * "$0.02–0.08". Equal bounds collapse to a single figure.
 *
 * The old ¢/$ split needed a same-unit check to avoid "¢80–$2.50"; everything is
 * dollars now, so the high bound always drops its symbol.
 */
export function formatEstimateRange(lowCents: number, highCents: number): string {
  if (lowCents === highCents) return formatCostCents(lowCents);
  const high = formatCostCents(highCents).replace(/^\$/, "");
  return `${formatCostCents(lowCents)}–${high}`;
}

/**
 * Calm pre-run cost line: "Est. ~$0.02–0.08 · You have $4.30". If the high estimate
 * exceeds the balance, surfaces a top-up link instead of a dead end.
 */
export function EstimateHint({
  operation,
  workspaceSlug,
}: {
  operation: EAiOperation;
  workspaceSlug: string;
}) {
  const estimate = useCostEstimate(operation);
  const { availableCents, isPending } = useWalletBalance(workspaceSlug);
  if (isPending) return null;

  const range = formatEstimateRange(estimate.low_cents, estimate.high_cents);
  const insufficient = estimate.high_cents > availableCents;

  return (
    <p className="text-[11px] text-muted-foreground">
      <span className="tabular-nums">Est. ~{range}</span>
      {insufficient ? (
        <>
          {" · "}
          <Link
            href={`/${workspaceSlug}/settings/billing`}
            className="font-medium text-amber-700 underline underline-offset-2 dark:text-amber-300"
          >
            Top up to run
          </Link>
        </>
      ) : (
        <span> · You have <span className="tabular-nums">{formatCents(availableCents)}</span></span>
      )}
    </p>
  );
}
