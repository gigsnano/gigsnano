"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  RefreshIcon,
  Tick02Icon,
  UserQuestion01Icon,
} from "@hugeicons/core-free-icons";

import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { RunStateBadge } from "@/components/issues/detail/widgets/run-state-badge";
import { Button } from "@/components/ui/button";
import { APIError } from "@/services/api-error";
import {
  useAgentResources,
  useCoordinateRun,
  useCreateRun,
  useRetryRun,
  useReviewRun,
  useStoryRoute,
  useStoryRuns,
} from "@/hooks/story/use-story-detail";
import {
  isTerminalRunState,
  runDisplayState,
  runProgress,
} from "@/lib/issues/agent-run-state";
import { formatTimestamp } from "@/lib/format/timestamp";
import { cn } from "@/lib/utils";
import type { EAgentAutonomy, IAgentRun } from "@/types/story/agent-run";

const SELECT =
  "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const AUTONOMY: EAgentAutonomy[] = ["suggest", "draft", "autopilot"];

/** Older runs stay behind a toggle so the newest one isn't buried. */
const HISTORY_PREVIEW = 3;

function StepRow({ step }: { step: IAgentRun["steps"][number] }) {
  const err = step.status === "error";
  const pending = step.status === "awaiting_approval";
  return (
    <li className="flex items-start gap-2 rounded-md px-1 py-1 text-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-1 motion-safe:animation-duration-200">
      <HugeiconsIcon
        icon={err ? Alert02Icon : pending ? UserQuestion01Icon : CheckmarkCircle02Icon}
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          err
            ? "text-destructive"
            : pending
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
        )}
        aria-hidden
      />
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {step.kind}
      </span>
      <span className="min-w-0 flex-1 text-foreground">{step.summary || "—"}</span>
      {step.tokens > 0 ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{step.tokens}t</span>
      ) : null}
    </li>
  );
}

export function IssueAgentRuns({
  workspaceSlug,
  projectId,
  storyId,
  assignedPersonaId,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  assignedPersonaId: string | null;
}) {
  const { data: runs, dataUpdatedAt } = useStoryRuns(workspaceSlug, projectId, storyId);
  const { data: resources } = useAgentResources(workspaceSlug);
  const createRun = useCreateRun(workspaceSlug, projectId, storyId);
  const retryRun = useRetryRun(workspaceSlug, projectId, storyId);
  const coordinate = useCoordinateRun(workspaceSlug, projectId, storyId);
  const { data: routing } = useStoryRoute(workspaceSlug, projectId, storyId);
  const approveRun = useReviewRun(workspaceSlug, projectId, storyId, "approve");
  const rejectRun = useReviewRun(workspaceSlug, projectId, storyId, "reject");

  const [persona, setPersona] = useState(assignedPersonaId ?? "");
  const [autonomy, setAutonomy] = useState<EAgentAutonomy>("draft");
  const [showAllRuns, setShowAllRuns] = useState(false);

  const latest = runs && runs.length > 0 ? runs[runs.length - 1] : null;
  const older = runs ? [...runs.slice(0, -1)].reverse() : [];
  const visibleOlder = showAllRuns ? older : older.slice(0, HISTORY_PREVIEW);
  const personaName = (id: string) => resources?.find((r) => r.id === id)?.name ?? id;
  const canStart = Boolean(persona) && !createRun.isPending;

  // Staleness is elapsed time, measured against the moment the data last
  // arrived rather than a render clock: `Date.now()` during render is impure,
  // and the query already polls while a run is live, so this advances on its
  // own without a timer here. `dataUpdatedAt` is 0 only before the first
  // response, when there is no run to judge.
  const now = dataUpdatedAt;
  const state = latest ? runDisplayState(latest, now) : null;
  const progress = latest ? runProgress(latest) : null;
  const canRetry = state ? isTerminalRunState(state) && state !== "done" : false;

  return (
    <IssueCollapsibleSection title="Agent run" defaultOpen={Boolean(latest)}>
      <div className="space-y-3">
        {latest && state && progress ? (
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <HugeiconsIcon icon={AiBrain01Icon} className="size-4 shrink-0 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {personaName(latest.persona_id)}
              </span>
              <span className="text-xs capitalize text-muted-foreground">· {latest.autonomy}</span>
              {/* The state label is the payload of this card, so it earns the swap. */}
              <RunStateBadge
                key={state}
                state={state}
                className="ml-auto motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:animation-duration-150"
              />
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {latest.cost_tokens} tokens · ${latest.cost_usd.toFixed(4)}
            </div>

            {state === "stale" ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  className="mt-px size-3.5 shrink-0 text-destructive"
                  aria-hidden
                />
                <span>
                  Nothing has come back from this run since{" "}
                  {formatTimestamp(latest.updated_at)}. It is no longer being driven — retry it, or
                  start a fresh one.
                </span>
              </p>
            ) : null}

            {progress.steps.length > 0 ? (
              <>
                <ul className="mt-2 space-y-0.5">
                  {progress.steps.map((s) => (
                    <StepRow key={s.id} step={s} />
                  ))}
                </ul>
                {progress.current && !isTerminalRunState(state) ? (
                  // "Step 3 · writing tests" rather than a bare spinner. No
                  // "of N": the agent doesn't declare its steps up front, so a
                  // total would be a number we invented.
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Step {progress.currentIndex} · {progress.current.summary || progress.current.kind}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Queued — no steps yet.</p>
            )}

            {state === "awaiting_review" && (
              <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-2">
                <p className="text-xs text-foreground">
                  {progress.current?.status === "awaiting_approval"
                    ? progress.current.summary
                    : "Review the agent's work before it continues."}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    disabled={approveRun.isPending}
                    onClick={() => approveRun.mutate(latest.id)}
                    className="active:scale-[0.98]"
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rejectRun.isPending}
                    onClick={() => rejectRun.mutate(latest.id)}
                    className="active:scale-[0.98]"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {canRetry && (
              <Button
                size="sm"
                variant="outline"
                disabled={retryRun.isPending}
                onClick={() => retryRun.mutate(latest.id)}
                className="mt-2 gap-1"
              >
                <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
                Retry
              </Button>
            )}
          </div>
        ) : routing ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={AiBrain01Icon} className="size-4 shrink-0 text-primary" />
              <span className="text-sm text-foreground">
                Recommended: <span className="font-medium">{routing.persona_name}</span>
              </span>
              <span className="ml-auto text-[10px] font-medium capitalize text-primary">
                {routing.confidence} confidence
              </span>
            </div>
            {routing.skills.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Skills: {routing.skills.map((s) => s.replace("skill:", "")).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{routing.rationale}</p>
            <Button
              size="sm"
              disabled={coordinate.isPending}
              onClick={() => coordinate.mutate(autonomy)}
              className="mt-2 gap-1 active:scale-[0.98]"
            >
              <HugeiconsIcon icon={AiBrain01Icon} className="size-3.5" />
              {coordinate.isPending ? "Routing…" : "Accept & auto-route"}
            </Button>
            {coordinate.isError ? (
              <p role="alert" className="mt-2 text-xs text-muted-foreground">
                {(coordinate.error as APIError)?.status === 402 ? (
                  <>
                    Auto-routing is a Business feature.{" "}
                    <Link
                      href={`/${workspaceSlug}/settings/billing`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      See plans
                    </Link>
                  </>
                ) : (
                  "Couldn't auto-route this work item — try again."
                )}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Assign a persona and start a run to have it planned and executed.
          </p>
        )}

        {older.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Earlier runs</p>
            <ul className="space-y-0.5">
              {visibleOlder.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-xs">
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {personaName(r.persona_id)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatTimestamp(r.created_at)}
                  </span>
                  <RunStateBadge state={runDisplayState(r, now)} />
                </li>
              ))}
            </ul>
            {older.length > HISTORY_PREVIEW ? (
              <button
                type="button"
                onClick={() => setShowAllRuns((v) => !v)}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAllRuns ? "Show fewer" : `Show all ${older.length} earlier runs`}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            aria-label="Persona"
            className={SELECT}
          >
            <option value="">Pick a persona…</option>
            {(resources ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.active_load}/{r.capacity})
              </option>
            ))}
          </select>
          <select
            value={autonomy}
            onChange={(e) => setAutonomy(e.target.value as EAgentAutonomy)}
            aria-label="Autonomy"
            className={cn(SELECT, "capitalize")}
          >
            {AUTONOMY.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!canStart}
            onClick={() => createRun.mutate({ persona_id: persona, autonomy })}
            className="gap-1"
          >
            <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
            {createRun.isPending ? "Starting…" : "Start run"}
          </Button>
        </div>
        {createRun.isError && (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" aria-hidden />
            Could not start the run (persona may be at capacity).
          </p>
        )}
      </div>
    </IssueCollapsibleSection>
  );
}
