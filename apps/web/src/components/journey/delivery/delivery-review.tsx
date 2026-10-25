"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, CheckmarkCircle02Icon, AlertCircleIcon, PlayIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import {
  assessReadiness,
  proposeFirstCycle,
  type ReadinessResult,
  type TaskLayer,
} from "@/lib/journey/delivery-plan";
import { useDeliveryPlan, useStartDelivery } from "@/hooks/journey/use-journey";
import { EmptyState } from "@/components/empty-state";

const LAYER_CHIP: Record<TaskLayer, string> = {
  frontend: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  api: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  service: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  data: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  integration: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  platform: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

const READINESS: Record<ReadinessResult, { label: string; chip: string }> = {
  PASS: { label: "PASS", chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  CONCERNS: { label: "CONCERNS", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  FAIL: { label: "FAIL", chip: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

export function DeliveryReview({
  workspaceSlug,
  projectId,
  stepId,
}: {
  workspaceSlug: string;
  projectId: string;
  stepId?: string;
}) {
  const { data: plan, isPending, isError, refetch } = useDeliveryPlan(workspaceSlug, projectId);
  const start = useStartDelivery(workspaceSlug, projectId);
  const [started, setStarted] = useState(false);
  const backHref = stepId
    ? `/${workspaceSlug}/projects/${projectId}/journey/${stepId}`
    : `/${workspaceSlug}/projects/${projectId}/journey`;

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Loading delivery plan…
      </div>
    );
  }
  if (isError || !plan) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load the delivery plan"
          description="Something went wrong loading the plan. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }
  if (plan.epics.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="board"
          title="No delivery plan yet"
          description="Break down epics & stories in the agent chat — the plan appears here once generated."
          actions={[{ label: "Back to step", href: backHref }]}
        />
      </div>
    );
  }

  const readiness = assessReadiness(plan);
  const cycle = proposeFirstCycle(plan);
  const r = READINESS[readiness.result];

  const handleStart = () => {
    if (start.isPending) return; // re-entry guard
    start.mutate(
      { title: cycle.title, storyIds: cycle.stories.map((s) => s.id) },
      { onSuccess: () => setStarted(true) },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <Link href={backHref} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          Back
        </Link>
        <span className="text-sm font-semibold text-foreground">Delivery review</span>
        <span className="text-xs text-muted-foreground">
          {readiness.totals.epics} epics · {readiness.totals.stories} stories · {readiness.totals.tasks} tasks
        </span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-xs font-semibold", r.chip)}>Readiness: {r.label}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
          {/* Plan tree */}
          <div className="space-y-4">
            {plan.epics.map((epic) => (
              <section key={epic.id}>
                <h2 className="mb-2 text-sm font-semibold text-foreground">{epic.title}</h2>
                <div className="space-y-2">
                  {epic.stories.map((story) => (
                    <div key={story.id} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{story.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{story.outcome}</p>
                        </div>
                        {story.screens && story.screens.length > 0 ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">{story.screens.length} screens</span>
                        ) : null}
                      </div>
                      <ul className="mt-2 space-y-1">
                        {story.tasks.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 text-sm">
                            {t.layer ? (
                              <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", LAYER_CHIP[t.layer])}>
                                {t.layer}
                              </span>
                            ) : null}
                            <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
                            {t.owner ? (
                              <span className="shrink-0 text-xs text-muted-foreground">{t.owner}</span>
                            ) : (
                              <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">Unowned</span>
                            )}
                            {t.hasTest !== undefined ? (
                              <HugeiconsIcon
                                icon={CheckmarkCircle02Icon}
                                className={cn("size-3.5 shrink-0", t.hasTest ? "text-emerald-500" : "text-muted-foreground/30")}
                                aria-label={t.hasTest ? "Has test" : "No test"}
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Right rail */}
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Layer coverage</h2>
                <span className="text-xs tabular-nums text-muted-foreground">{readiness.coveragePct}%</span>
              </div>
              <ul className="space-y-1">
                {readiness.coverage.map((c) => (
                  <li key={c.layer} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-foreground">{c.layer}</span>
                    <span className="text-xs text-muted-foreground">{c.tasks} tasks</span>
                  </li>
                ))}
              </ul>
            </div>

            {readiness.issues.length > 0 ? (
              <div className="space-y-2 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Readiness issues</h2>
                <ul className="space-y-1">
                  {readiness.issues.map((issue) => (
                    <li key={issue.message} className="flex items-start gap-2 text-xs">
                      <HugeiconsIcon icon={AlertCircleIcon} className={cn("mt-0.5 size-3.5 shrink-0", issue.severity === "error" ? "text-red-500" : "text-amber-500")} />
                      <span className="text-foreground">{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
              <h2 className="text-sm font-semibold text-foreground">{cycle.title}</h2>
              <ul className="space-y-1">
                {cycle.stories.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5 text-sm text-foreground">
                    <span className="size-1.5 rounded-full bg-primary" />
                    {s.title}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={handleStart}
                disabled={readiness.result === "FAIL" || started || start.isPending}
                className={cn(
                  "mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
                  started ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                <HugeiconsIcon icon={started ? CheckmarkCircle02Icon : PlayIcon} className="size-4" />
                {start.isPending ? "Starting…" : started ? "Delivery started" : "Start delivery"}
              </button>
              {start.isError ? (
                <p className="text-center text-[11px] font-medium text-destructive">Couldn&apos;t start delivery — try again.</p>
              ) : started ? (
                <p className="text-center text-[11px] text-muted-foreground">Cycle created from the plan — the picked stories moved into it.</p>
              ) : readiness.result === "CONCERNS" ? (
                <p className="text-center text-[11px] text-muted-foreground">Warnings can be acknowledged — you can still start delivery.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
