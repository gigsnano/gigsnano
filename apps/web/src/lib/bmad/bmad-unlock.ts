import type { IProject, IStory } from "@/types";
import { EStoryStatus } from "@/types";

/** Returns true when a story counts as satisfied (done or explicitly skipped). */
export function isStorySatisfied(story: IStory): boolean {
  if (story.status === EStoryStatus.Done) return true;
  return story.bmad?.skipped === true;
}

function findByWorkflow(projectStories: IStory[], workflow: string): IStory | undefined {
  return projectStories.find((s) => s.bmad?.workflow === workflow);
}

function isSatisfied(projectStories: IStory[], workflow: string): boolean {
  const s = findByWorkflow(projectStories, workflow);
  return s ? isStorySatisfied(s) : false;
}

/**
 * BMAD hard dependencies — docs/base-guides/bmad-workflow-guide.md §6 unlock rules.
 */
function canUnlockStory(
  story: IStory,
  projectStories: IStory[],
  project: Pick<IProject, "has_ui">,
): boolean {
  if (!story.bmad) return true;
  const w = story.bmad.workflow;

  if (w === "track-selection" || w === "cleanup-artifacts") return true;
  if (w === "scope-selection") return isSatisfied(projectStories, "bmad-generate-project-context");

  // Optional analysis — unlock after track/scope; skippable without blocking PRD
  if (["bmad-brainstorming", "bmad-research", "bmad-product-brief"].includes(w)) {
    return (
      isSatisfied(projectStories, "track-selection") ||
      isSatisfied(projectStories, "scope-selection")
    );
  }

  if (w === "bmad-document-project") {
    return isSatisfied(projectStories, "cleanup-artifacts") || true;
  }

  if (w === "bmad-generate-project-context") {
    return (
      isSatisfied(projectStories, "bmad-document-project") ||
      isSatisfied(projectStories, "cleanup-artifacts") ||
      true
    );
  }

  if (w === "bmad-prd") {
    return (
      isSatisfied(projectStories, "track-selection") ||
      isSatisfied(projectStories, "scope-selection")
    );
  }

  if (w === "bmad-ux") {
    if (!project.has_ui) return false;
    return isSatisfied(projectStories, "bmad-prd");
  }

  if (w === "bmad-create-architecture") {
    if (!isSatisfied(projectStories, "bmad-prd")) return false;
    if (project.has_ui) {
      const ux = findByWorkflow(projectStories, "bmad-ux");
      if (ux && !isStorySatisfied(ux)) return false;
    }
    return true;
  }

  if (w === "bmad-create-epics-and-stories") {
    return (
      isSatisfied(projectStories, "bmad-prd") &&
      isSatisfied(projectStories, "bmad-create-architecture")
    );
  }

  if (w === "bmad-check-implementation-readiness") {
    return isSatisfied(projectStories, "bmad-create-epics-and-stories");
  }

  if (w === "bmad-sprint-planning") {
    const gate = findByWorkflow(projectStories, "bmad-check-implementation-readiness");
    return (
      gate?.status === EStoryStatus.Done &&
      gate.bmad?.readiness_result === "pass"
    );
  }

  return true;
}

export interface IBmadLockMessage {
  badge: string;
  detail: string;
  action?: string;
  blockerStoryId?: string;
}

/** User-facing copy when a BMAD card is locked — badge is always visible on the card. */
export function getBmadLockMessage(
  story: IStory,
  projectStories: IStory[],
): IBmadLockMessage | null {
  if (!story.bmad?.is_locked) return null;

  if (story.bmad.workflow === "bmad-sprint-planning") {
    const gate = findByWorkflow(projectStories, "bmad-check-implementation-readiness");
    if (!gate) {
      return {
        badge: "Prerequisites incomplete",
        detail: "Complete the Implementation Readiness gate before Sprint Planning.",
      };
    }
    if (gate.status !== EStoryStatus.Done) {
      return {
        badge: "Waiting on readiness gate",
        detail: "Finish Implementation Readiness before this step unlocks.",
        action: "Tap to open the readiness gate",
        blockerStoryId: gate.id,
      };
    }
    if (gate.bmad?.readiness_result !== "pass") {
      const result = (gate.bmad?.readiness_result ?? "pending").toUpperCase();
      return {
        badge: `Readiness gate: ${result}`,
        detail: "Sprint Planning unlocks only when the gate is marked PASS.",
        action: "Tap to open the readiness gate",
        blockerStoryId: gate.id,
      };
    }
  }

  const sorted = projectStories.filter((s) => s.bmad).toSorted((a, b) => a.order - b.order);
  const idx = sorted.findIndex((s) => s.id === story.id);
  for (let i = idx - 1; i >= 0; i--) {
    const pred = sorted[i];
    if (pred.bmad?.is_required && !isStorySatisfied(pred)) {
      return {
        badge: `Complete step ${pred.order + 1} first`,
        detail: `"${pred.title}" must be done before this step unlocks.`,
        action: `Tap to open ${pred.title}`,
        blockerStoryId: pred.id,
      };
    }
  }

  return {
    badge: "Step locked",
    detail: "Complete earlier BMAD planning steps to unlock.",
  };
}

/** @deprecated Use getBmadLockMessage().detail */
export function getBmadLockHint(story: IStory, projectStories: IStory[]): string {
  const msg = getBmadLockMessage(story, projectStories);
  if (!msg) return "";
  return [msg.badge, msg.detail, msg.action].filter(Boolean).join(" ");
}

/** Recompute `bmad.is_locked` for every Sprint-0 story from dependency rules. */
export function applyStoryLocks(
  projectStories: IStory[],
  project: Pick<IProject, "has_ui">,
): void {
  for (const story of projectStories) {
    if (!story.bmad) continue;
    if (story.bmad.workflow === "bmad-ux" && !project.has_ui) {
      story.bmad.skipped = true;
      story.bmad.is_locked = true;
      continue;
    }
    story.bmad.is_locked = !canUnlockStory(story, projectStories, project);
  }
}

/** First unlocked, incomplete story — bmad-help analogue. */
function getNextStory(projectStories: IStory[]): IStory | null {
  const sorted = projectStories.toSorted((a, b) => a.order - b.order);
  return (
    sorted.find(
      (s) => s.bmad && !s.bmad.is_locked && !isStorySatisfied(s),
    ) ?? null
  );
}

export function rollupSprintZeroProgress(projectStories: IStory[]): number {
  const relevant = projectStories.filter(
    (s) => !(s.bmad?.workflow === "bmad-ux" && s.bmad.skipped),
  );
  if (!relevant.length) return 0;
  const done = relevant.filter((s) => s.status === EStoryStatus.Done).length;
  return Math.round((done / relevant.length) * 100);
}
