"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, SearchList01Icon } from "@hugeicons/core-free-icons";

import type { IJourney, IJourneyStep } from "@/types";
import type { IJourneyView } from "@/lib/journey/derive";

import { PhaseStrip } from "./phase-strip";
import { NextActionCard } from "./next-action-card";
import { JourneySteps } from "./journey-steps";
import { AttentionRail } from "./attention-rail";
import { ActiveStepPanel } from "./active-step-panel";

export function JourneyHome({
  journey,
  view,
  workspaceSlug,
  projectId,
}: {
  journey: IJourney;
  view: IJourneyView;
  workspaceSlug: string;
  projectId: string;
}) {
  const base = `/${workspaceSlug}/projects/${projectId}/journey`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? journey.steps.find((s) => s.id === selectedId) ?? null : null;

  const select = (step: IJourneyStep) => setSelectedId(step.id);
  const attentionCount = view.blockers.length + view.attention.length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Project Journey</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-emerald-500" />
              {view.verifiedCount}/{view.totalApplicable} verified
            </span>
            {attentionCount > 0 ? <span> · {attentionCount} need attention</span> : null}
          </p>
        </div>
        <Link
          href={`${base}/discovery`}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <HugeiconsIcon icon={SearchList01Icon} className="size-4" />
          Existing project? Run discovery
        </Link>
      </header>

      <PhaseStrip phases={view.phases} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          {view.nextAction ? (
            <NextActionCard
              step={view.nextAction.step}
              reason={view.nextAction.reason}
              href={`${base}/${view.nextAction.step.id}`}
            />
          ) : (
            <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5 text-emerald-500" />
                Journey complete
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every applicable step is verified. You’re ready to start delivery.
              </p>
            </section>
          )}

          <JourneySteps
            steps={journey.steps}
            locks={view.locks}
            activeStepId={selected?.id}
            onSelect={select}
          />
        </div>

        <AttentionRail
          attention={view.attention}
          blockers={view.blockers}
          recentOutputs={view.recentOutputs}
          onSelect={select}
        />
      </div>

      <ActiveStepPanel
        step={selected}
        lockReason={selected ? view.locks[selected.id] : null}
        workspaceHref={selected ? `${base}/${selected.id}` : undefined}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
