import type { IStory } from "@/types";
import { EProjectFlow, EStoryStatus, EStoryPriority, EReadinessResult } from "@/types";

import {
  BROWNFIELD_SPRINT_ZERO_STEPS,
  FRESH_SPRINT_ZERO_STEPS,
  type TBmadStep,
} from "@/constants/bmad-sprint-zero";
import { applyStoryLocks } from "@/lib/bmad/bmad-unlock";

import { devStories } from "./dev-stories";

const SEED_TS = "2026-05-04T10:00:00Z";

function buildStoriesFromSteps(
  steps: readonly TBmadStep[],
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  doneCount: number,
  hasUi: boolean,
): IStory[] {
  const filtered = steps.filter((step) => !step.requires_ui || hasUi);

  const built = filtered.map((step, i) => {
    let status: EStoryStatus;
    if (i < doneCount) status = EStoryStatus.Done;
    else if (i === doneCount) status = doneCount === 0 ? EStoryStatus.Todo : EStoryStatus.InProgress;
    else status = EStoryStatus.Todo;

    return {
      id: `st_${projectId}_${i}`,
      workspace_slug: workspaceSlug,
      project_id: projectId,
      cycle_id: cycleId,
      module_id: null,
      title: step.title,
      description: step.description,
      status,
      priority: EStoryPriority.None,
      start_date: null,
      target_date: null,
      order: i,
      assignee_id: null,
      ai_agent_id: null,
      label_id: null, label_ids: [],
      estimate_id: null,
      estimate_points: null,
      parent_id: null,
      sub_issue_count: 0,
      bmad: {
        workflow: step.workflow,
        agent: step.agent,
        artifact: step.artifact,
        is_locked: true,
        is_required: step.required,
        skipped: false,
        readiness_result:
          step.workflow === "bmad-check-implementation-readiness" && status === EStoryStatus.Done
            ? EReadinessResult.Pass
            : null,
      },
      created_at: SEED_TS,
      updated_at: SEED_TS,
    };
  });

  applyStoryLocks(built, { has_ui: hasUi });
  return built;
}

function makeSprintZeroStories(
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  doneCount: number,
  hasUi = true,
): IStory[] {
  return buildStoriesFromSteps(
    FRESH_SPRINT_ZERO_STEPS,
    workspaceSlug,
    projectId,
    cycleId,
    doneCount,
    hasUi,
  );
}

function makeBrownfieldStories(
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  doneCount: number,
  hasUi = true,
): IStory[] {
  return buildStoriesFromSteps(
    BROWNFIELD_SPRINT_ZERO_STEPS,
    workspaceSlug,
    projectId,
    cycleId,
    doneCount,
    hasUi,
  );
}

export function seedSprintZeroStories(
  flow: EProjectFlow,
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  doneCount: number,
  hasUi: boolean,
): IStory[] {
  return flow === EProjectFlow.Existing
    ? makeBrownfieldStories(workspaceSlug, projectId, cycleId, doneCount, hasUi)
    : makeSprintZeroStories(workspaceSlug, projectId, cycleId, doneCount, hasUi);
}

export const stories: IStory[] = [
  ...makeSprintZeroStories("acme", "prj_mba", "cyc_mba_s0", 10, true),
  ...makeBrownfieldStories("acme", "prj_ad", "cyc_ad_s0", 5, true),
  ...makeBrownfieldStories("acme", "prj_ds", "cyc_ds_s0", 0, true),
];

export const allStories: IStory[] = [...stories, ...devStories];
