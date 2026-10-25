/**
 * Layer-aware delivery plan (GIN-429) — pure model, coverage, readiness and a
 * first-cycle proposal. Derived (here: seeded) from the approved PRD,
 * Experience Contract and Solution Topology; a vertical story keeps its layer
 * tasks together rather than fragmenting into parallel per-layer stories.
 */

export type TaskLayer = "frontend" | "api" | "service" | "data" | "integration" | "platform";
export type TaskKind = "feature" | "enabler";

export interface ILayerTask {
  id: string;
  title: string;
  owner: string | null;
  /** Layer taxonomy — absent when the source has no layer metadata (real epic tree). */
  layer?: TaskLayer;
  hasTest?: boolean;
  kind?: TaskKind;
}

export interface IPlanStory {
  id: string;
  title: string;
  outcome: string;
  /** Experience screens this slice implements — a screen with no frontend task is a gap. */
  screens?: string[];
  tasks: ILayerTask[];
}

export interface IEpic {
  id: string;
  title: string;
  stories: IPlanStory[];
}

export interface IDeliveryPlan {
  epics: IEpic[];
}

export type ReadinessResult = "PASS" | "CONCERNS" | "FAIL";

export interface ICoverage {
  layer: TaskLayer;
  tasks: number;
}

export interface IReadinessReport {
  result: ReadinessResult;
  coveragePct: number;
  coverage: ICoverage[];
  issues: { severity: "error" | "warning"; message: string; storyId?: string }[];
  totals: { epics: number; stories: number; tasks: number };
}

const LAYER_ORDER: TaskLayer[] = ["frontend", "api", "service", "data", "integration", "platform"];

function allStories(plan: IDeliveryPlan): IPlanStory[] {
  return plan.epics.flatMap((e) => e.stories);
}
function allTasks(plan: IDeliveryPlan): ILayerTask[] {
  return allStories(plan).flatMap((s) => s.tasks);
}

/** Readiness: coverage %, per-layer counts and concrete missing links. */
export function assessReadiness(plan: IDeliveryPlan): IReadinessReport {
  const stories = allStories(plan);
  const tasks = allTasks(plan);
  const issues: IReadinessReport["issues"] = [];

  for (const story of stories) {
    if (story.tasks.length === 0) {
      // Story-level-only tree (no task breakdown yet) — a concern, not a hard fail.
      issues.push({ severity: "warning", message: `"${story.title}" isn't broken into tasks yet.`, storyId: story.id });
    }
    const hasFrontend = story.tasks.some((t) => t.layer === "frontend");
    if ((story.screens?.length ?? 0) > 0 && !hasFrontend) {
      issues.push({ severity: "error", message: `"${story.title}" has approved screens but no frontend work.`, storyId: story.id });
    }
    for (const t of story.tasks) {
      if (!t.owner) issues.push({ severity: "warning", message: `${t.title} is unowned.`, storyId: story.id });
      // Only flag a missing contract test when the source actually says there is none.
      if (t.layer === "api" && t.hasTest === false) {
        issues.push({ severity: "warning", message: `API task "${t.title}" has no contract test.`, storyId: story.id });
      }
    }
  }

  const coverage: ICoverage[] = LAYER_ORDER.map((layer) => ({
    layer,
    tasks: tasks.filter((t) => t.layer === layer).length,
  })).filter((c) => c.tasks > 0);

  // "Covered" story = has tasks and (no screens or a frontend task).
  const covered = stories.filter((s) => s.tasks.length > 0 && ((s.screens?.length ?? 0) === 0 || s.tasks.some((t) => t.layer === "frontend"))).length;
  const coveragePct = stories.length === 0 ? 0 : Math.round((covered / stories.length) * 100);

  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = issues.some((i) => i.severity === "warning");
  const result: ReadinessResult = hasError ? "FAIL" : hasWarning ? "CONCERNS" : "PASS";

  return {
    result,
    coveragePct,
    coverage,
    issues,
    totals: { epics: plan.epics.length, stories: stories.length, tasks: tasks.length },
  };
}

/** Proposed first cycle: a thin end-to-end slice plus its foundation enablers. */
export function proposeFirstCycle(plan: IDeliveryPlan): { title: string; stories: IPlanStory[] } {
  const stories = allStories(plan);
  // Enabler-only stories must have tasks — empty [].every() is vacuously true.
  const enablers = stories.filter((s) => s.tasks.length > 0 && s.tasks.every((t) => t.kind === "enabler"));
  // First feature slice; a task with no `kind` counts as a feature. Falls back to
  // the first story when the tree has no task-level `kind` data (real epic tree).
  const firstVertical =
    stories.find((s) => s.tasks.some((t) => (t.kind ?? "feature") === "feature")) ?? stories[0];
  const picked = [...enablers, firstVertical].filter(Boolean) as IPlanStory[];
  return { title: "Cycle 1 — Foundation + first vertical slice", stories: [...new Set(picked)] };
}

export function seedDeliveryPlan(): IDeliveryPlan {
  return {
    epics: [
      {
        id: "epic-onboarding",
        title: "Customer onboarding",
        stories: [
          {
            id: "s-signup",
            title: "Sign up and verify",
            outcome: "A new customer can register and verify their identity.",
            screens: ["Sign up", "Verify"],
            tasks: [
              { id: "t1", layer: "frontend", title: "Sign-up & verify screens", owner: "Web team", hasTest: true, kind: "feature" },
              { id: "t2", layer: "api", title: "POST /auth/register + verify", owner: "Platform team", hasTest: false, kind: "feature" },
              { id: "t3", layer: "data", title: "Users + verification tables", owner: "Platform team", hasTest: true, kind: "feature" },
              { id: "t4", layer: "integration", title: "KYC provider connector", owner: null, hasTest: true, kind: "feature" },
            ],
          },
          {
            id: "s-foundation",
            title: "Platform foundation",
            outcome: "Shared auth, CI and observability are in place.",
            screens: [],
            tasks: [
              { id: "t5", layer: "platform", title: "CI/CD + environments", owner: "Platform team", hasTest: true, kind: "enabler" },
              { id: "t6", layer: "platform", title: "Auth & session middleware", owner: "Platform team", hasTest: true, kind: "enabler" },
            ],
          },
        ],
      },
      {
        id: "epic-payments",
        title: "Payments",
        stories: [
          {
            id: "s-transfer",
            title: "Send a transfer",
            outcome: "A customer can move money to another account.",
            screens: ["Transfer", "Confirmation"],
            tasks: [
              { id: "t7", layer: "frontend", title: "Transfer flow screens", owner: "Web team", hasTest: true, kind: "feature" },
              { id: "t8", layer: "api", title: "POST /transfers", owner: "Platform team", hasTest: true, kind: "feature" },
              { id: "t9", layer: "service", title: "Ledger + limits", owner: "Platform team", hasTest: true, kind: "feature" },
              { id: "t10", layer: "data", title: "Transactions table", owner: "Platform team", hasTest: true, kind: "feature" },
            ],
          },
        ],
      },
    ],
  };
}
