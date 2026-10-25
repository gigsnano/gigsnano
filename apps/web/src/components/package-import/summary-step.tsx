"use client";

import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IReadiness } from "@/lib/package-import/intake";
import type { IApplyResult, IImportPlan } from "@/types";

/** GIN-401's Project Intake Summary: what happened, what still needs a human, and
 *  the one thing to do next. Shown after apply, and reachable again afterwards. */
export function SummaryStep({
  workspaceSlug,
  projectId,
  result,
  plan,
  readinessResult,
  nextActionText,
  isRollingBack,
  onRollback,
  onRetry,
}: {
  workspaceSlug: string;
  projectId: string;
  result: IApplyResult;
  plan: IImportPlan | null;
  readinessResult: IReadiness;
  nextActionText: string;
  isRollingBack: boolean;
  onRollback: () => void;
  onRetry: () => void;
}) {
  const partial = result.failed > 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            partial ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600",
          )}
        >
          <HugeiconsIcon
            icon={partial ? Alert02Icon : CheckmarkCircle02Icon}
            className="size-4"
          />
        </span>
        <div>
          <h2 className="text-base font-medium text-foreground">
            {partial ? "Imported with some failures" : "Package imported"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.applied} created
            {result.failed > 0 ? ` · ${result.failed} failed` : ""}
            {result.skipped > 0 ? ` · ${result.skipped} already existed` : ""}
          </p>
        </div>
      </header>

      {/* The score is only useful if it says why. Every point is attributable. */}
      <section className="rounded-lg border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">Readiness</h3>
          <span className="text-2xl font-medium tabular-nums text-foreground">
            {readinessResult.score}
            <span className="text-sm text-muted-foreground">/100</span>
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {readinessResult.factors.map((factor) => (
            <li key={factor.label} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{factor.label}</span>
                <span className="block text-xs text-muted-foreground">{factor.detail}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {factor.earned}/{factor.weight}
              </span>
              <span aria-hidden className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${(factor.earned / factor.weight) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryGroup title="Ready" items={readinessResult.ready} tone="ready" />
        <SummaryGroup
          title="Needs confirmation"
          items={readinessResult.needsConfirmation}
          tone="warn"
        />
        <SummaryGroup title="Blocked" items={readinessResult.blocked} tone="blocked" />
      </div>

      {partial ? (
        <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3.5 py-3">
          <p className="text-sm text-foreground">
            {result.failed} change{result.failed === 1 ? "" : "s"} could not be created. The rest
            were, so retrying only attempts what failed.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry failed
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRollingBack}
              onClick={onRollback}
            >
              {isRollingBack ? "Rolling back…" : "Roll back this import"}
            </Button>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border bg-muted/30 p-4">
        <h3 className="text-sm font-medium text-foreground">Recommended next action</h3>
        <p className="mt-1 text-sm text-muted-foreground">{nextActionText}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={`/${workspaceSlug}/projects/${projectId}/issues`}>
              Open created work items
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/${workspaceSlug}/projects/${projectId}/cycles`}>View cycles</Link>
          </Button>
          {!partial ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRollingBack}
              onClick={onRollback}
            >
              {isRollingBack ? "Rolling back…" : "Roll back this import"}
            </Button>
          ) : null}
        </div>
      </section>

      {plan ? (
        <p className="text-xs text-muted-foreground">
          Import reference {plan.correlation_id} · strategy {plan.strategy}. Every created item
          links back to the document section it came from.
        </p>
      ) : null}
    </div>
  );
}

function SummaryGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "ready" | "warn" | "blocked";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border p-3.5",
        tone === "blocked" && items.length > 0 && "border-destructive/30",
        tone === "warn" && items.length > 0 && "border-amber-500/40",
      )}
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="ml-1.5 font-normal normal-case">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {items.map((item) => (
            <li key={item} className="text-sm text-foreground">
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
