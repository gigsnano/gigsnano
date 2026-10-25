"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/project/use-projects";
import {
  useCreateRecurrence,
  useDeleteRecurrence,
  useRecurrences,
  useSetRecurrenceEnabled,
  useTemplates,
} from "@/hooks/template/use-templates";
import type { TRecurrenceUnit } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNITS: TRecurrenceUnit[] = ["minutes", "hours", "days"];
const selectCls =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** ISO timestamp → "Jul 21, 09:00" via string parse (no locale/tz shift). */
function nextRunLabel(iso: string | null): string {
  if (!iso) return "—";
  const [date, time = ""] = iso.split("T");
  const [, m, d] = date.split("-");
  const hm = time.slice(0, 5);
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}${hm ? `, ${hm}` : ""}`;
}

export function RecurrencePanel({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: projects } = useProjects(workspaceSlug);
  const { data: workItemTemplates } = useTemplates(workspaceSlug, "work_item");
  const [projectId, setProjectId] = useState<string | null>(null);
  const activeProject = projectId ?? projects?.[0]?.id ?? null;

  const { data: recurrences } = useRecurrences(workspaceSlug, activeProject ?? "");
  const create = useCreateRecurrence(workspaceSlug, activeProject ?? "");
  const toggle = useSetRecurrenceEnabled(workspaceSlug, activeProject ?? "");
  const del = useDeleteRecurrence(workspaceSlug, activeProject ?? "");

  const [templateId, setTemplateId] = useState("");
  const [every, setEvery] = useState(1);
  const [unit, setUnit] = useState<TRecurrenceUnit>("days");

  const templates = workItemTemplates ?? [];
  const activeTemplateId = templateId || templates[0]?.id || "";
  const templateName = (id: string | null) =>
    templates.find((t) => t.id === id)?.name ?? id ?? "template";

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Recurrence</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Project</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {projects?.find((p) => p.id === activeProject)?.name ?? "Select"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {(projects ?? []).map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setProjectId(p.id)}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Existing recurrences */}
      <div className="mt-3">
        {recurrences && recurrences.length ? (
          <ul className="flex flex-col gap-2">
            {recurrences.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{templateName(r.template_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    every {r.every} {r.unit} · next {nextRunLabel(r.next_run_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggle.mutate({ recurrenceId: r.id, enabled: !r.enabled })}
                >
                  {r.enabled ? "Pause" : "Resume"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete recurrence"
                  onClick={() => del.mutate(r.id)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No recurrences for this project. Add one below to spawn a work item on a cadence.
          </p>
        )}
      </div>

      {/* New recurrence */}
      <div className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Template
          <select
            value={activeTemplateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className={selectCls}
            aria-label="Work-item template"
            disabled={templates.length === 0}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Every
          <Input
            type="number"
            min={1}
            value={every}
            onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
            aria-label="Interval"
            className="h-9 w-20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Unit
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as TRecurrenceUnit)}
            className={selectCls}
            aria-label="Unit"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={!activeTemplateId || !activeProject || create.isPending}
          onClick={() =>
            create.mutate({ template_id: activeTemplateId, every, unit })
          }
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Add recurrence
        </Button>
      </div>
    </section>
  );
}
