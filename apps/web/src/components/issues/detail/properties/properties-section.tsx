"use client";

import Link from "next/link";
import {
  Calculator01Icon,
  Calendar03Icon,
  Clock01Icon,
  DashboardSquare02Icon,
  LabelIcon,
  Layers01Icon,
  LinkSquare02Icon,
  RulerIcon,
  Timer01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import {
  EstimateSuggestion,
  StoryDurationPicker,
  StoryEstimatePicker,
  StoryLabelPicker,
  StorySizePicker,
} from "@/components/board";
import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { CustomFieldsControl } from "@/components/issues/detail/properties/custom-fields-control";
import { IssueParentPicker } from "@/components/issues/detail/properties/parent-picker";
import { IssuePropertyListItem } from "@/components/issues/detail/shared/property-list-item";
import { StoryCyclePicker } from "@/components/issues/detail/properties/cycle-picker";
import { StoryModulePicker } from "@/components/issues/detail/properties/module-picker";
import { StoryTypePicker } from "@/components/issues/shared/type-picker";
import { formatTimestamp } from "@/lib/format/timestamp";
import { useProject } from "@/hooks/project/use-projects";
import type { IStory } from "@/types";

/** Estimate row label + icon per planning method (GIN-331). Absent keys
 *  ("automatic", "") render no estimate control at all. */
const ESTIMATE_ROW_META: Record<string, { label: string; icon: typeof Calculator01Icon }> = {
  points: { label: "Estimate", icon: Calculator01Icon },
  simple: { label: "Size", icon: RulerIcon },
  time: { label: "Duration", icon: Timer01Icon },
};

/** Plane-style properties — collapsible block (peek) or flat list (sidebar). */
export function IssueProperties({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  showProjectLink = false,
  variant = "collapsible",
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  showProjectLink?: boolean;
  variant?: "collapsible" | "sidebar";
}) {
  const project = useProject(workspaceSlug, projectId);
  const projectBase = `/${workspaceSlug}/projects/${projectId}`;

  // Method-aware estimate row (GIN-331). Automatic (and while loading) shows no
  // estimate control at all — never an invented value.
  const estimateMeta = ESTIMATE_ROW_META[project.data?.planning_method ?? ""] ?? null;

  const fields = (
    <div className="space-y-0.5">
        <IssuePropertyListItem icon={DashboardSquare02Icon} label="Type">
          <StoryTypePicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
          />
        </IssuePropertyListItem>

        {showProjectLink && project.data ? (
          <IssuePropertyListItem icon={Layers01Icon} label="Project">
            <Link
              href={projectBase}
              className="inline-flex h-7 items-center truncate text-sm font-medium text-primary hover:underline"
            >
              {project.data.name}
            </Link>
          </IssuePropertyListItem>
        ) : null}

        <IssuePropertyListItem icon={LinkSquare02Icon} label="Parent">
          <IssueParentPicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
          />
        </IssuePropertyListItem>

        <IssuePropertyListItem icon={LabelIcon} label="Labels">
          <StoryLabelPicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            hideLabel
            fullWidth
          />
        </IssuePropertyListItem>

        <IssuePropertyListItem icon={Calendar03Icon} label="Cycle">
          <StoryCyclePicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
          />
        </IssuePropertyListItem>

        <IssuePropertyListItem icon={Layers01Icon} label="Module">
          <StoryModulePicker
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
          />
        </IssuePropertyListItem>

        {/* Method-aware estimate row (GIN-331): the label/icon + control follow the
            project's planning method; Automatic shows no estimate control. Each
            control self-gates, so exactly one renders. */}
        {estimateMeta ? (
          <IssuePropertyListItem icon={estimateMeta.icon} label={estimateMeta.label}>
            <StoryEstimatePicker
              story={story}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              hideLabel
              fullWidth
            />
            <StorySizePicker
              story={story}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              hideLabel
              fullWidth
            />
            <StoryDurationPicker
              story={story}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              hideLabel
              fullWidth
            />
          </IssuePropertyListItem>
        ) : null}

        {/* AI estimate suggestion (GIN-332) — self-hides unless Points mode + un-estimated. */}
        <EstimateSuggestion
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
        />

        <IssuePropertyListItem icon={UserGroupIcon} label="Created">
          <time dateTime={story.created_at} className="inline-flex h-7 items-center text-sm text-foreground">
            {formatTimestamp(story.created_at)}
          </time>
        </IssuePropertyListItem>

        <IssuePropertyListItem icon={Clock01Icon} label="Updated">
          <time dateTime={story.updated_at} className="inline-flex h-7 items-center text-sm text-foreground">
            {formatTimestamp(story.updated_at)}
          </time>
        </IssuePropertyListItem>

        <CustomFieldsControl story={story} workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
  );

  if (variant === "sidebar") return fields;

  return (
    <IssueCollapsibleSection title="Properties" defaultOpen>
      {fields}
    </IssueCollapsibleSection>
  );
}
