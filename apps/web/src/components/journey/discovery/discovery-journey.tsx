"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, CheckmarkCircle02Icon, AlertCircleIcon, HelpCircleIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import {
  baselineProgress,
  nextDiscoveryAction,
  DISCOVERY_PHASES,
  type EvidenceStatus,
  type IDiscovery,
} from "@/lib/journey/discovery";
import { useDiscovery, useSaveDiscovery } from "@/hooks/journey/use-journey";
import { EmptyState } from "@/components/empty-state";

const STATUS_ICON: Record<EvidenceStatus, { icon: typeof CheckmarkCircle02Icon; color: string }> = {
  confirmed: { icon: CheckmarkCircle02Icon, color: "text-emerald-500" },
  attention: { icon: AlertCircleIcon, color: "text-amber-500" },
  unknown: { icon: HelpCircleIcon, color: "text-muted-foreground" },
};

function DiscoveryJourneyInner({
  workspaceSlug,
  projectId,
  initialDiscovery,
  initialSaved,
}: {
  workspaceSlug: string;
  projectId: string;
  initialDiscovery: IDiscovery;
  initialSaved: boolean;
}) {
  const [discovery, setDiscovery] = useState<IDiscovery>(initialDiscovery);
  const [approved, setApproved] = useState(initialSaved);

  const save = useSaveDiscovery(workspaceSlug, projectId);
  const handleApprove = () => {
    if (save.isPending) return; // re-entry guard
    save.mutate(discovery, { onSuccess: () => setApproved(true) });
  };

  const progress = baselineProgress(discovery.evidence);
  const nextAction = nextDiscoveryAction(discovery.evidence);
  const activePhase = progress.confirmedPct === 100 ? "Baseline" : "Discover";
  const journeyHref = `/${workspaceSlug}/projects/${projectId}/journey`;

  const setEvidenceStatus = (id: string, status: EvidenceStatus) => {
    setDiscovery((prev) => ({ ...prev, evidence: prev.evidence.map((e) => (e.id === id ? { ...e, status } : e)) }));
    setApproved(false);
  };
  const confirmComponent = (id: string) => {
    setDiscovery((prev) => ({ ...prev, components: prev.components.map((c) => (c.id === id ? { ...c, confirmed: true } : c)) }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <Link href={journeyHref} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          Journey
        </Link>
        <span className="text-sm font-semibold text-foreground">Existing-project discovery</span>
        <span className="ml-auto text-xs text-muted-foreground">
          Baseline {progress.confirmedPct}% confirmed · {progress.unknowns} unknown · {progress.attention} needs attention
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Phase strip */}
          <ol className="flex items-center gap-1 overflow-x-auto pb-1 text-sm">
            {DISCOVERY_PHASES.map((p, i) => {
              const active = p === activePhase;
              const done = i === 0; // Connect done
              return (
                <li key={p} className="flex shrink-0 items-center gap-1">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", active ? "bg-primary/10 font-semibold text-primary" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    {done ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" /> : active ? <span className="size-2 rounded-full bg-primary" /> : <span className="size-2 rounded-full border border-muted-foreground/40" />}
                    {p}
                  </span>
                  {i < DISCOVERY_PHASES.length - 1 ? <span className={cn("h-px w-4", done ? "bg-emerald-500/40" : "bg-border")} /> : null}
                </li>
              );
            })}
          </ol>

          {/* Next action */}
          <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
            <p className="text-xs font-medium text-primary">Next</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{nextAction}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Evidence: {discovery.evidence.length} sources · confirm inferred items before approving the baseline.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
            {/* Evidence */}
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Current evidence</h2>
              <ul className="space-y-1.5">
                {discovery.evidence.map((e) => {
                  const s = STATUS_ICON[e.status];
                  return (
                    <li key={e.id} className="flex items-center gap-2">
                      <HugeiconsIcon icon={s.icon} className={cn("size-4 shrink-0", s.color)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{e.name}</span>
                        <span className="block text-[11px] capitalize text-muted-foreground">{e.kind} · {Math.round(e.confidence * 100)}% confidence{e.note ? ` · ${e.note}` : ""}</span>
                      </span>
                      {e.status !== "confirmed" ? (
                        <button type="button" onClick={() => setEvidenceStatus(e.id, "confirmed")} className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/60">
                          Confirm
                        </button>
                      ) : (
                        <button type="button" onClick={() => setEvidenceStatus(e.id, "unknown")} className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                          Unmark
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Detected system */}
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">Detected system</h2>
              <p className="text-xs text-muted-foreground">Inferred components — confirm before they enter the baseline.</p>
              <ul className="space-y-1.5">
                {discovery.components.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] capitalize text-muted-foreground">{c.type}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{Math.round(c.confidence * 100)}% · evidence: {c.evidence}</span>
                    </span>
                    {c.confirmed ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
                        Confirmed
                      </span>
                    ) : (
                      <button type="button" onClick={() => confirmComponent(c.id)} className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/60">
                        Confirm
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Approve baseline */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <button
              type="button"
              onClick={handleApprove}
              disabled={approved || save.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium shadow-sm transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] disabled:cursor-default",
                approved ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {approved ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" /> : null}
              {save.isPending ? "Saving…" : approved ? "Baseline approved" : "Approve current-state baseline"}
            </button>
            <span className="text-xs text-muted-foreground">
              {approved
                ? "Current-State Baseline v1 created — define your change next."
                : progress.unknowns > 0
                  ? "Unknowns can be accepted with rationale; critical ones block only the steps they affect."
                  : "All evidence confirmed."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Loads existing-project discovery (GIN-432) — evidence + detected components
 * projected from the project's real repos/docs/backlog, or the saved baseline —
 * and mounts the reviewer seeded from it. Approve persists the current-state
 * baseline via the real .../journey/discovery/ endpoint.
 */
export function DiscoveryJourney({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useDiscovery(workspaceSlug, projectId);

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Scanning the existing project…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't scan the project"
          description="Something went wrong loading discovery. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }
  return (
    <DiscoveryJourneyInner
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      initialDiscovery={data.discovery}
      initialSaved={data.saved}
    />
  );
}
