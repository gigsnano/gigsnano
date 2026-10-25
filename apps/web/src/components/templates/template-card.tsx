"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Globe02Icon,
  SquareLock02Icon,
  Delete02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/project/use-projects";
import { useApplyTemplate, useDeleteTemplate } from "@/hooks/template/use-templates";
import type { ITemplate } from "@/types";
import { cn } from "@/lib/utils";

function VisibilityBadge({ visibility }: { visibility: string }) {
  const isPublic = visibility === "public";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
        isPublic
          ? "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <HugeiconsIcon icon={isPublic ? Globe02Icon : SquareLock02Icon} className="size-3" />
      {isPublic ? "Public" : "Private"}
    </span>
  );
}

export function TemplateCard({
  workspaceSlug,
  template,
}: {
  workspaceSlug: string;
  template: ITemplate;
}) {
  const { data: projects } = useProjects(workspaceSlug);
  const apply = useApplyTemplate(workspaceSlug);
  const del = useDeleteTemplate(workspaceSlug);
  const [appliedTo, setAppliedTo] = useState<string | null>(null);

  const checklist = (template.content?.checklist as string[] | undefined) ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{template.name}</span>
        <VisibilityBadge visibility={template.visibility} />
      </div>

      {checklist.length ? (
        <p className="truncate text-xs text-muted-foreground">
          {checklist.length} checklist item{checklist.length === 1 ? "" : "s"}
        </p>
      ) : template.kind === "project" ? (
        <p className="text-xs text-muted-foreground">Applied when creating a project.</p>
      ) : null}

      <div className="mt-1 flex items-center gap-2">
        {template.kind === "work_item" ? (
          appliedTo ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
              Added to {projects?.find((p) => p.id === appliedTo)?.name ?? "project"}
            </span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={apply.isPending}>
                  Apply to…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {(projects ?? []).map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() =>
                      apply.mutate(
                        { projectId: p.id, templateId: template.id },
                        { onSuccess: () => setAppliedTo(p.id) },
                      )
                    }
                  >
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label="Delete template"
          onClick={() => del.mutate(template.id)}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
        </Button>
      </div>
    </div>
  );
}
