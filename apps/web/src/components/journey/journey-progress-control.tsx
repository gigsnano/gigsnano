"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { useJourney } from "@/hooks/journey/use-journey";
import { deriveJourneyState, JOURNEY_PHASE_LABEL } from "@/lib/journey/derive";

/**
 * Compact persistent journey control for the project header (GIN-428):
 * `Experience · 2/4 verified · Next: <step>`. Links to the full journey.
 * Renders nothing until a journey exists (or the flag is off — gated by caller).
 */
export function JourneyProgressControl({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data } = useJourney(workspaceSlug, projectId);
  if (!data || data.steps.length === 0) return null;

  const view = deriveJourneyState(data);
  const activePhase = view.phases.find((p) => p.state === "active");

  return (
    <Link
      href={`/${workspaceSlug}/projects/${projectId}/journey`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {activePhase ? (
        <span className="font-medium text-foreground">{JOURNEY_PHASE_LABEL[activePhase.phase]}</span>
      ) : null}
      <span className="inline-flex items-center gap-1 tabular-nums">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-emerald-500" />
        {view.verifiedCount}/{view.totalApplicable}
      </span>
      {view.nextAction ? (
        <span className="hidden truncate sm:inline">· Next: {view.nextAction.step.title}</span>
      ) : null}
    </Link>
  );
}
