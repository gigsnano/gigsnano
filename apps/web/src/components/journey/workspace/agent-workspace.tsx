"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Exchange01Icon,
  PaintBoardIcon,
  HierarchySquare01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { deriveJourneyState, JOURNEY_PHASE_LABEL } from "@/lib/journey/derive";
import { PHASE_PERSONA, nextStepAfter } from "@/lib/journey/agent-workspace";
import type { IJourney, IJourneyStep } from "@/types";

import { ContextPanel } from "./context-panel";
import { DecisionSurface } from "./decision-surface";
import { OutputPreview } from "./output-preview";
import { JourneyStepChat } from "./journey-step-chat";

type Tab = "context" | "chat" | "choices" | "preview";
const TABS: { id: Tab; label: string }[] = [
  { id: "context", label: "Context" },
  { id: "chat", label: "Chat" },
  { id: "choices", label: "Choices" },
  { id: "preview", label: "Preview" },
];

const AGENT_OPTIONS = (persona: string) => [persona, "Assign to teammate", "Assign to expert"];

export function AgentWorkspace({
  workspaceSlug,
  projectId,
  journey,
  step,
}: {
  workspaceSlug: string;
  projectId: string;
  journey: IJourney;
  step: IJourneyStep;
}) {
  const view = deriveJourneyState(journey);
  const stepById = new Map(journey.steps.map((s) => [s.id, s]));
  const prereqTitles = step.prerequisites.map((id) => stepById.get(id)?.title ?? id);
  const lockReason = view.locks[step.id] ?? null;
  const next = nextStepAfter(journey, step.id);
  const journeyHref = `/${workspaceSlug}/projects/${projectId}/journey`;
  const stepBase = `${journeyHref}/${step.id}`;
  const surfaceCta =
    step.surface === "experience"
      ? {
          href: `${stepBase}/studio`,
          icon: PaintBoardIcon,
          title: "Design in Experience Studio",
          desc: "Compare directions, tune tokens, preview & approve.",
        }
      : step.surface === "topology"
        ? {
            href: `${stepBase}/topology`,
            icon: HierarchySquare01Icon,
            title: "Model in Solution Topology",
            desc: "Lay out layers & dependencies, validate & approve.",
          }
        : step.surface === "delivery"
          ? {
              href: `${stepBase}/delivery`,
              icon: HierarchySquare01Icon,
              title: "Review the delivery plan",
              desc: "Layer-aware backlog, coverage, readiness & first cycle.",
            }
          : null;

  const [tab, setTab] = useState<Tab>("context");
  const [agent, setAgent] = useState(PHASE_PERSONA[step.phase]);
  const [agentMenu, setAgentMenu] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(step.decisions.flatMap((d) => (d.value ? [[d.label, d.value] as const] : []))),
  );
  const firstMade = step.decisions.find((d) => selected[d.label]);
  const decisionSummary = firstMade ? `${firstMade.label}: ${selected[firstMade.label]}` : undefined;

  const show = (id: Tab, base = "block") => cn(tab === id ? base : "hidden", "lg:block");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <Link
          href={journeyHref}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          Journey
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
        <span className="text-sm font-medium text-foreground">
          {JOURNEY_PHASE_LABEL[step.phase]} · {step.title}
        </span>

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {view.verifiedCount}/{view.totalApplicable} verified
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAgentMenu((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
          >
            {agent}
            <HugeiconsIcon icon={Exchange01Icon} className="size-3.5 text-muted-foreground" />
          </button>
          {agentMenu ? (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border bg-popover py-1 shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150">
              {AGENT_OPTIONS(PHASE_PERSONA[step.phase]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setAgent(opt);
                    setAgentMenu(false);
                  }}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    agent === opt && "text-primary",
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile region tabs */}
      <div role="tablist" aria-label="Workspace region" className="flex gap-1 border-b px-3 py-1.5 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Regions */}
      {/* Bounded region: each column owns its own scroll so the chat composer stays
          pinned to the bottom of its column instead of drifting down the page as the
          conversation grows (GIN-476). */}
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr_20rem]">
          <div className={cn("min-h-0 space-y-4 overflow-y-auto lg:col-start-1 lg:row-start-1", tab === "context" || tab === "choices" ? "block" : "hidden", "lg:block")}>
            {surfaceCta ? (
              <Link
                href={surfaceCta.href}
                className="flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 transition-colors hover:bg-primary/10"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <HugeiconsIcon icon={surfaceCta.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{surfaceCta.title}</span>
                  <span className="block text-xs text-muted-foreground">{surfaceCta.desc}</span>
                </span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ) : null}
            <div className={show("context")}>
              <ContextPanel step={step} prereqTitles={prereqTitles} lockReason={lockReason} />
            </div>
            <div className={show("choices")}>
              <DecisionSurface
                decisions={step.decisions}
                selected={selected}
                onSelect={(label, value) => setSelected((prev) => ({ ...prev, [label]: value }))}
              />
            </div>
          </div>

          <div className={cn("min-h-0 lg:col-start-2 lg:row-start-1", tab === "chat" ? "flex flex-col" : "hidden", "lg:flex lg:flex-col")}>
            <JourneyStepChat workspaceSlug={workspaceSlug} projectId={projectId} storyId={step.id} />
          </div>

          <div className={cn("min-h-0 overflow-y-auto lg:col-start-3 lg:row-start-1", show("preview"))}>
            <OutputPreview step={step} decisionSummary={decisionSummary ?? ""} />
          </div>
        </div>
      </div>

      {/* Footer — completion is the agent chat's "Generate document" (real finalize);
          this row is just onward navigation. */}
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">
          Generate the {step.output?.label ?? "document"} in the agent chat to complete this step.
        </span>
        {next ? (
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/journey/${next.id}`}
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Next: {next.title}
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
