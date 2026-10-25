"use client";

import { useProjectMembers } from "@/hooks/project/use-project-members";
import { useAgentResources } from "@/hooks/story/use-story-detail";
import { useProjectStories } from "@/hooks/story/use-stories";
import { cn } from "@/lib/utils";

function Bar({ pct, over }: { pct: number; over?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full transition-[width] duration-300", over ? "bg-destructive" : "bg-primary")}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

/** Mixed human + agent workload/capacity board (GIN-182). Humans: open assigned
 * work items; agents (personas): active runs against concurrency capacity. */
export function ProjectWorkloadTab({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: stories } = useProjectStories(workspaceSlug, projectId);
  const { data: members } = useProjectMembers(workspaceSlug, projectId);
  const { data: agents } = useAgentResources(workspaceSlug);

  const openByAssignee = new Map<string, number>();
  (stories ?? []).forEach((s) => {
    if (s.assignee_id && s.status !== "done") {
      openByAssignee.set(s.assignee_id, (openByAssignee.get(s.assignee_id) ?? 0) + 1);
    }
  });
  const maxHuman = Math.max(1, ...openByAssignee.values());

  return (
    <div className="space-y-5">
      <section>
        <p className="mb-2 text-xs font-medium text-muted-foreground">People</p>
        <ul className="space-y-2.5">
          {(members ?? []).map((m) => {
            const load = openByAssignee.get(m.user_id) ?? 0;
            return (
              <li key={m.user_id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{m.display_name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{load} open</span>
                </div>
                <Bar pct={(load / maxHuman) * 100} />
              </li>
            );
          })}
          {(members ?? []).length === 0 && (
            <li className="text-xs text-muted-foreground">No members yet.</li>
          )}
        </ul>
      </section>

      <section>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Agents</p>
        <ul className="space-y-2.5">
          {(agents ?? []).map((a) => {
            const over = a.active_load >= a.capacity;
            return (
              <li key={a.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{a.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        over
                          ? "text-destructive"
                          : a.active_load === 0
                            ? "text-muted-foreground"
                            : "text-primary",
                      )}
                    >
                      {over ? "overloaded" : a.active_load === 0 ? "idle" : "ok"}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        over ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {a.active_load}/{a.capacity}
                    </span>
                  </span>
                </div>
                <Bar pct={(a.active_load / a.capacity) * 100} over={over} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
