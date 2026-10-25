"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon } from "@hugeicons/core-free-icons";

import { useProject } from "@/hooks/project/use-projects";
import { useProjectEstimates } from "@/hooks/project/use-project-settings";
import { useEstimateSuggestion } from "@/hooks/story/use-story-detail";
import { useProjectStories, useUpdateStoryEstimate } from "@/hooks/story/use-stories";
import { formatPoints, valuesForType } from "@/lib/issues/estimate-values";
import { cn } from "@/lib/utils";
import type { IStory } from "@/types";

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "Low confidence",
};

/**
 * Advisory AI estimate suggestion (GIN-332) — Confirm / Modify / Dismiss.
 *
 * Points mode only, and only for un-estimated items (the "I don't know what to
 * pick" case). Nothing is ever written without an explicit click: Confirm writes
 * the suggested value, Modify lets the user pick a different one, Dismiss hides
 * the card. Reasons and the cited similar items are always visible.
 *
 * ponytail: acceptance-feedback recording (suggestion/accepted-value eval table)
 * is a separate deferred backend slice — add when the eval store lands.
 */
export function EstimateSuggestion({
  story,
  workspaceSlug,
  projectId,
  cycleId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  const { data: project } = useProject(workspaceSlug, projectId);
  const isPointsMode = project?.planning_method === "points";
  const unestimated = !story.estimate_id;

  const { data: suggestion } = useEstimateSuggestion(
    workspaceSlug,
    projectId,
    story.id,
    isPointsMode && unestimated,
  );
  const { data: estimates } = useProjectEstimates(workspaceSlug, projectId);
  const { data: stories } = useProjectStories(workspaceSlug, projectId);
  const updateEstimate = useUpdateStoryEstimate(workspaceSlug, projectId, cycleId);

  const [dismissed, setDismissed] = useState(false);
  const [modifying, setModifying] = useState(false);

  if (!isPointsMode || !unestimated || dismissed) return null;
  if (!suggestion?.applicable || suggestion.suggested_value == null) return null;

  const scales = estimates ?? [];
  const scale = scales.find((e) => e.type === "points") ?? scales[0];
  if (!scale) return null;

  const write = (points: number) =>
    updateEstimate.mutate({ storyId: story.id, estimateId: scale.id, estimatePoints: points });

  const storyById = new Map((stories ?? []).map((s) => [s.id, s]));
  const base = `/${workspaceSlug}/projects/${projectId}/issues`;
  const hasRange =
    suggestion.low != null && suggestion.high != null && suggestion.low !== suggestion.high;

  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={AiMagicIcon} className="size-4 text-primary" />
        <span className="font-medium text-foreground">
          Suggested estimate: {formatPoints(suggestion.suggested_value, scale.type)}
          {hasRange ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              ({formatPoints(suggestion.low!, scale.type)}–
              {formatPoints(suggestion.high!, scale.type)})
            </span>
          ) : null}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {CONFIDENCE_LABEL[suggestion.confidence] ?? "Low confidence"}
        </span>
      </div>

      {suggestion.reasons.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {suggestion.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span
                className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50"
                aria-hidden="true"
              />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {suggestion.similar_item_ids.length ? (
        <div className="mt-1.5">
          <span className="text-[11px] text-muted-foreground/80">Based on </span>
          <span className="inline-flex flex-wrap gap-1.5 align-middle">
            {suggestion.similar_item_ids.map((id) => {
              const s = storyById.get(id);
              return (
                <Link
                  key={id}
                  href={`${base}/${id}`}
                  className="rounded border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent hover:underline"
                  title={s?.title ?? "Open work item"}
                >
                  {s?.code ?? id.slice(0, 8)}
                </Link>
              );
            })}
          </span>
        </div>
      ) : null}

      {modifying ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Pick an estimate">
          {valuesForType(scale.type).map((pts) => (
            <button
              key={pts}
              type="button"
              disabled={updateEstimate.isPending}
              onClick={() => write(pts)}
              className="rounded-md border bg-background px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-accent active:scale-[0.97] disabled:opacity-50"
            >
              {formatPoints(pts, scale.type)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setModifying(false)}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            disabled={updateEstimate.isPending}
            onClick={() => write(suggestion.suggested_value!)}
            className={cn(
              "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground",
              "transition-colors hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50",
            )}
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={updateEstimate.isPending}
            onClick={() => setModifying(true)}
            className="rounded-md border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent active:scale-[0.97]"
          >
            Modify
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
