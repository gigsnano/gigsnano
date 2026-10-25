"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain01Icon,
  UserGroupIcon,
  BriefcaseDollarIcon,
  Alert02Icon,
  Edit02Icon,
  SparklesIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/project/use-projects";
import { useMembers } from "@/hooks/workspace/use-members";
import { useAcceptTriage, useDismissTriage, useProcessTriage } from "@/hooks/intake/use-intake";
import { STORY_PRIORITY_META, STORY_TYPE_META } from "@/constants/story-meta";
import { EStoryPriority, EStoryType, ETriageSource, ETriageStatus } from "@/types";
import type { ITriageItem, IRecommendedRoute, TTriageRoute } from "@/types";

const SOURCE_LABEL: Record<ETriageSource, string> = {
  [ETriageSource.Personal]: "Personal",
  [ETriageSource.InApp]: "In-app",
  [ETriageSource.PublicForm]: "Public form",
  [ETriageSource.Email]: "Email",
  [ETriageSource.Customer]: "Customer",
};

const TASK_TYPE_STORY: Record<string, EStoryType> = {
  bug: EStoryType.Bug,
  feature: EStoryType.Feature,
  task: EStoryType.Task,
  story: EStoryType.Story,
};

const ROUTES: { key: TTriageRoute; label: string; icon: typeof AiBrain01Icon }[] = [
  { key: "persona", label: "Persona", icon: AiBrain01Icon },
  { key: "team", label: "Team", icon: UserGroupIcon },
  { key: "gig", label: "Gig", icon: BriefcaseDollarIcon },
];

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TriageCard({
  item,
  workspaceSlug,
  index = 0,
}: {
  item: ITriageItem;
  workspaceSlug: string;
  index?: number;
}) {
  const process = useProcessTriage(workspaceSlug);
  const accept = useAcceptTriage(workspaceSlug);
  const dismiss = useDismissTriage(workspaceSlug);
  const { data: projects } = useProjects(workspaceSlug);
  const { data: members } = useMembers(workspaceSlug);

  const rec = item.recommended_route as IRecommendedRoute;
  // Overrides start null so the card always reflects fresh props (e.g. after
  // `process` re-triages the item) until the user actually picks/edits.
  const [routeOverride, setRouteOverride] = useState<TTriageRoute | null>(null);
  const [projectOverride, setProjectOverride] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<{ title: string; desc: string } | null>(null);

  const style: CSSProperties = { animationDelay: `${Math.min(index, 8) * 40}ms` };
  const mountAnim =
    "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300 motion-safe:ease-out";

  // ---- New (untriaged) — show a single Triage action ----
  if (item.status === ETriageStatus.New) {
    return (
      <article style={style} className={cn("rounded-xl border bg-card p-4", mountAnim)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{item.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.body}</p>
          </div>
          <Chip className="shrink-0 border-border bg-muted text-muted-foreground">
            {SOURCE_LABEL[item.source]}
          </Chip>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => process.mutate(item.id)}
            disabled={process.isPending}
          >
            <HugeiconsIcon icon={SparklesIcon} className="size-4" />
            {process.isPending ? "Triaging…" : "Triage"}
          </Button>
        </div>
      </article>
    );
  }

  // ---- Triaged — the recommendation card ----
  const priority = (item.priority ?? EStoryPriority.Medium) as EStoryPriority;
  const priorityMeta = STORY_PRIORITY_META[priority];
  const taskType = item.classification.task_type ?? rec?.task_type ?? "story";
  const typeMeta = STORY_TYPE_META[TASK_TYPE_STORY[taskType] ?? EStoryType.Story];
  const dupe = item.duplicate_ids[0];

  const route = routeOverride ?? rec?.route ?? "persona";
  const projectId = projectOverride ?? item.project_id;
  const baseTitle = item.enriched_title ?? item.title;
  const baseDesc = item.enriched_description ?? `<p>${item.body}</p>`;
  const draftTitle = edits?.title ?? baseTitle;
  const draftDesc = edits?.desc ?? baseDesc;
  // Plain-text summary for the collapsed preview — no HTML sink; the full draft
  // stays editable as text below.
  const preview = draftDesc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const needsProject = !projectId;
  const assignee = members?.find((m) => m.user_id === assigneeId);
  const project = projects?.find((p) => p.id === projectId);

  const onAccept = () => {
    accept.mutate({
      itemId: item.id,
      payload: {
        project_id: projectId,
        route,
        assignee_id: route === "team" ? assigneeId : null,
        title: edits ? edits.title : undefined,
        description: edits ? edits.desc : undefined,
      },
    });
  };

  return (
    <article style={style} className={cn("rounded-xl border bg-card p-4 shadow-sm", mountAnim)}>
      {/* Header: source + customer weight signal */}
      <div className="flex items-center justify-between gap-2">
        <Chip className="border-border bg-muted text-muted-foreground">
          {SOURCE_LABEL[item.source]}
        </Chip>
        <div className="flex items-center gap-1.5">
          <Chip className={cn("border", typeMeta.chip)}>
            <HugeiconsIcon icon={typeMeta.icon} className="size-3" />
            {taskType}
          </Chip>
          {dupe ? (
            <Tooltipish label={`Possible duplicate of #${dupe.story_number}: ${dupe.title}`}>
              <Chip className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <HugeiconsIcon icon={Alert02Icon} className="size-3" />
                dupe · #{dupe.story_number}
              </Chip>
            </Tooltipish>
          ) : null}
          <Chip className={cn("border", priorityMeta.chip)}>{priorityMeta.label}</Chip>
        </div>
      </div>

      {/* Draft (editable) */}
      <div className="mt-3">
        {editing ? (
          <div className="space-y-2">
            <Input
              value={draftTitle}
              onChange={(e) => setEdits({ title: e.target.value, desc: draftDesc })}
              aria-label="Draft title"
              className="font-medium"
            />
            <textarea
              value={draftDesc}
              onChange={(e) => setEdits({ title: draftTitle, desc: e.target.value })}
              aria-label="Draft description"
              rows={4}
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium">{draftTitle}</h3>
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {preview || item.body}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEdits((e) => e ?? { title: baseTitle, desc: baseDesc });
                setEditing(true);
              }}
              aria-label="Edit draft"
            >
              <HugeiconsIcon icon={Edit02Icon} className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Rationale */}
      {rec?.rationale ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={AiBrain01Icon} className="mr-1 inline size-3.5 align-[-2px]" />
          {rec.rationale}
        </p>
      ) : null}

      {/* Route selector + accept */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {ROUTES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRouteOverride(r.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                route === r.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={r.icon} className="size-3.5" />
              {r.label}
            </button>
          ))}
        </div>

        {/* Route target */}
        {route === "persona" ? (
          <span className="text-xs text-muted-foreground">
            → {rec?.persona_name ?? "Developer"}
          </span>
        ) : route === "team" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {assignee?.display_name ?? "Pick assignee"}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {(members ?? []).map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => setAssigneeId(m.user_id)}>
                  {m.display_name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-xs text-muted-foreground">→ publish as a marketplace gig</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Project picker — required when the item has no project */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={needsProject ? "outline" : "ghost"} size="sm">
                {project?.name ?? "Select project"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {(projects ?? []).map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setProjectOverride(p.id)}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            onClick={onAccept}
            disabled={
              accept.isPending || needsProject || (route === "team" && !assigneeId)
            }
          >
            {accept.isPending ? "Accepting…" : "Accept"}
          </Button>
        </div>
      </div>

      {/* Secondary actions */}
      <div className="mt-3 flex items-center gap-3 border-t pt-2 text-xs text-muted-foreground">
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => dismiss.mutate(item.id)}
          disabled={dismiss.isPending}
        >
          Reject
        </button>
        {dupe ? (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => dismiss.mutate(item.id)}
              disabled={dismiss.isPending}
            >
              Merge into #{dupe.story_number}
            </button>
          </>
        ) : null}
        {editing ? (
          <button
            type="button"
            className="ml-auto hover:text-foreground"
            onClick={() => setEditing(false)}
          >
            Done editing
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** Tiny title-attr wrapper so the dupe badge is inspectable without a full Tooltip. */
function Tooltipish({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span title={label} className="inline-flex">
      {children}
    </span>
  );
}
