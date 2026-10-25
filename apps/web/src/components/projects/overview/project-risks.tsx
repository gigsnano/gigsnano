"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useProjectHealth } from "@/hooks/project/use-forecasting";
import { useProjectStories } from "@/hooks/story/use-stories";
import { useMembers } from "@/hooks/workspace/use-members";
import { cn } from "@/lib/utils";
import type { IStory } from "@/types";

type Severity = "blocked" | "overdue";

const SEV_META: Record<Severity, { label: string; badge: string }> = {
  blocked: {
    label: "Blocked",
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  overdue: {
    label: "Overdue",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
};

function ageDays(iso: string, nowMs: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || !nowMs) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/** Risks & blockers table (GIN-340): severity, title, owner, age, work-item link.
 *  Severity comes from the backend health evidence (blocked_by / overdue reasons);
 *  React only resolves ids → story/owner for display. */
export function ProjectRisks({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: health, isPending } = useProjectHealth(workspaceSlug, projectId);
  const { data: stories } = useProjectStories(workspaceSlug, projectId);
  const { data: members } = useMembers(workspaceSlug);

  const [nowMs, setNowMs] = useState(0);
  // react-doctor-disable-next-line react-hooks-js/set-state-in-effect -- one-time clock read after mount
  useEffect(() => setNowMs(Date.now()), []);

  const storyById = new Map<string, IStory>((stories ?? []).map((s) => [s.id, s]));
  const ownerName = (id: string | null) =>
    id ? members?.find((m) => m.user_id === id)?.display_name ?? null : null;

  // Most-severe-wins: a blocked item outranks merely overdue.
  const severity = new Map<string, Severity>();
  for (const r of health?.reasons ?? []) {
    if (r.code === "overdue_work") for (const id of r.contributing_ids) severity.set(id, "overdue");
  }
  for (const r of health?.reasons ?? []) {
    if (r.code === "critical_blockers") for (const id of r.contributing_ids) severity.set(id, "blocked");
  }

  const rows = [...severity.entries()]
    .map(([id, sev]) => ({ id, sev, story: storyById.get(id) }))
    .sort((a, b) => (a.sev === b.sev ? 0 : a.sev === "blocked" ? -1 : 1));

  const base = `/${workspaceSlug}/projects/${projectId}/issues`;

  return (
    <section className="mt-10 border-t pt-6" aria-labelledby="project-risks-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="project-risks-heading" className="text-sm font-semibold text-foreground">
          Risks &amp; blockers
        </h2>
        {rows.length ? (
          <span className="text-xs text-muted-foreground">{rows.length}</span>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-4 h-12 w-full animate-pulse rounded-lg bg-muted" />
      ) : !rows.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No blocked or overdue work — risks surface here from the health engine.
        </p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1 font-medium">Risk</th>
              <th className="pb-1 font-medium">Work item</th>
              <th className="pb-1 font-medium">Owner</th>
              <th className="pb-1 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, sev, story }) => {
              const owner = ownerName(story?.assignee_id ?? null);
              const age = story ? ageDays(story.created_at, nowMs) : null;
              return (
                <tr key={id} className="border-t">
                  <td className="py-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
                        SEV_META[sev].badge,
                      )}
                    >
                      {SEV_META[sev].label}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <Link
                      href={`${base}/${id}`}
                      className="font-medium text-foreground hover:underline"
                      title={story?.title ?? "Open work item"}
                    >
                      {story?.code ?? id.slice(0, 8)}
                    </Link>
                    {story?.title ? (
                      <span className="ml-1.5 text-muted-foreground">
                        {story.title.length > 48 ? `${story.title.slice(0, 48)}…` : story.title}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{owner ?? "Unassigned"}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {age != null ? `${age}d` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
