"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useCycles } from "@/hooks/project/use-cycles";
import { cn } from "@/lib/utils";
import { ECycleStatus, type ICycle } from "@/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Days from now to `iso` (negative = in the past), or null. */
function daysUntil(iso: string | null, nowMs: number): number | null {
  if (!iso || !nowMs) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - nowMs) / 86_400_000);
}

function timeLeftLabel(cycle: ICycle, nowMs: number): string {
  const d = daysUntil(cycle.end_date, nowMs);
  if (d == null) return "";
  if (d > 1) return `${d} days left`;
  if (d === 1) return "1 day left";
  if (d === 0) return "ends today";
  return `ended ${Math.abs(d)}d ago`;
}

/** Current-cycle summary (GIN-340): the active sprint's commitment, completed,
 *  remaining and time left. Reads cycle counts from the backend; no recomputation. */
export function ProjectCycle({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: cycles, isPending } = useCycles(workspaceSlug, projectId);
  const [nowMs, setNowMs] = useState(0);
  // react-doctor-disable-next-line react-hooks-js/set-state-in-effect -- one-time clock read after mount
  useEffect(() => setNowMs(Date.now()), []);

  const active = (cycles ?? []).find(
    (c) => c.status === ECycleStatus.Active && !c.is_sprint_zero,
  );

  return (
    <section className="mt-10 border-t pt-6" aria-labelledby="project-cycle-heading">
      <h2 id="project-cycle-heading" className="text-sm font-semibold text-foreground">
        Current cycle
      </h2>

      {isPending ? (
        <div className="mt-4 h-14 w-full animate-pulse rounded-lg bg-muted" />
      ) : !active ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No active cycle. Start a cycle to track sprint commitment and burn-down here.
        </p>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/${workspaceSlug}/projects/${projectId}/cycles/${active.id}`}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {active.name}
            </Link>
            <span className="text-xs text-muted-foreground">
              {fmtDate(active.start_date)}
              {active.end_date ? ` – ${fmtDate(active.end_date)}` : ""}
              {active.end_date ? ` · ${timeLeftLabel(active, nowMs)}` : ""}
            </span>
          </div>

          {(() => {
            const total = active.story_count;
            const done = active.completed_story_count;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full bg-emerald-500")} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    <span className="font-medium tabular-nums text-foreground">
                      {done}/{total}
                    </span>{" "}
                    done
                  </span>
                  <span className="tabular-nums">{total - done} remaining · {pct}%</span>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
