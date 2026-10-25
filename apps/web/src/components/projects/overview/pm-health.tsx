"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthUser } from "@/hooks/auth/use-auth";
import { useMembers } from "@/hooks/workspace/use-members";
import { useCreatePmUpdate, useLatestPmUpdate } from "@/hooks/project/use-pm-health";
import { HEALTH_STATUS_META } from "@/lib/forecasting/health-status";
import { cn } from "@/lib/utils";
import { EMemberStatus, EWorkspaceRole, type TPmHealthStatus } from "@/types";

const TONE_PILL: Record<string, string> = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  caution: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  critical: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  neutral: "border-border bg-muted text-muted-foreground",
};

const STATUS_OPTIONS: TPmHealthStatus[] = ["on_track", "at_risk", "off_track"];

const field =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function StatusPill({ status }: { status: TPmHealthStatus }) {
  const meta = HEALTH_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE_PILL[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function PmHealthPanel({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: latest, isPending } = useLatestPmUpdate(workspaceSlug, projectId);
  const { data: user } = useAuthUser();
  const { data: members } = useMembers(workspaceSlug);
  const create = useCreatePmUpdate(workspaceSlug, projectId);

  const me = members?.find((m) => m.user_id === user?.id && m.status === EMemberStatus.Active);
  // Affordance only — the backend enforces project-viewer rejection. Default to
  // allowing while membership loads.
  const canPost = !members || (Boolean(me) && me?.role !== EWorkspaceRole.Guest);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<TPmHealthStatus>("on_track");
  const [narrative, setNarrative] = useState("");
  const [keyRisks, setKeyRisks] = useState("");
  const [decision, setDecision] = useState("");

  const reset = () => {
    setStatus("on_track");
    setNarrative("");
    setKeyRisks("");
    setDecision("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending || !narrative.trim()) return; // re-entry guard
    create.mutate(
      {
        reported_status: status,
        narrative: narrative.trim(),
        key_risks: keyRisks.trim() || null,
        decision_needed: decision.trim() || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  };

  return (
    <section className="mt-10 border-t pt-6" aria-labelledby="pm-health-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pm-health-heading" className="text-sm font-semibold text-foreground">
          PM-reported health
        </h2>
        {canPost ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {latest ? "Post update" : "Add update"}
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-4 h-14 w-full animate-pulse rounded-lg bg-muted" />
      ) : latest ? (
        <div className="mt-4 rounded-lg border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={latest.reported_status} />
            <span className="text-xs text-muted-foreground">
              by {latest.author_name} · {fmtDate(latest.created_at)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{latest.narrative}</p>
          {latest.key_risks ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium">Key risks:</span> {latest.key_risks}
            </p>
          ) : null}
          {latest.decision_needed ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium">Decision needed:</span> {latest.decision_needed}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No PM update yet — the manager&apos;s own read on health, kept separate from the
          system forecast, appears here.
        </p>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          setOpen(next);
        }}
      >
        <DialogContent>
          <DialogTitle>Post PM health update</DialogTitle>
          <DialogDescription>
            Your read on delivery health. This is recorded separately and never overwrites the
            system forecast.
          </DialogDescription>
          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-1 rounded-md border bg-input/30 p-0.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={status === s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                    status === s
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {HEALTH_STATUS_META[s].label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Narrative
              <textarea
                required
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="What's your read on delivery, and why?"
                rows={3}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Key risks <span className="font-normal text-muted-foreground">(optional)</span>
              <textarea
                value={keyRisks}
                onChange={(e) => setKeyRisks(e.target.value)}
                rows={2}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Decision needed <span className="font-normal text-muted-foreground">(optional)</span>
              <input
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                className={field}
              />
            </label>
            {create.isError ? (
              <p className="text-sm text-destructive">
                Couldn&apos;t post the update. You may not have permission.
              </p>
            ) : null}
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || !narrative.trim()}>
                {create.isPending ? "Posting…" : "Post update"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
