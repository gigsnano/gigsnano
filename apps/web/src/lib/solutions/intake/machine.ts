import {
  EIntakeStepStatus,
  type IIntakeDefinition,
  type IIntakeProgress,
  type IIntakeStartingPointConfig,
  type IIntakeState,
  type IIntakeStepDefinition,
  type IIntakeStepRecord,
  type IStartingPointChangePreview,
} from "@/types/solution/intake";
import type { ESolutionKey } from "@/types";

/**
 * Pure intake state machine (GIN-444).
 *
 * Rules enforced here rather than in the UI:
 * - A step unlocks only when every prerequisite is settled.
 * - A required step cannot be skipped without a waiver rationale.
 * - Changing a material value invalidates that step and everything that
 *   depended on it — backtracking is explicit, not silent.
 * - The next action is derived from the definition + state; the client cannot
 *   invent a step the machine would keep locked.
 */

const SETTLED: ReadonlySet<EIntakeStepStatus> = new Set([
  EIntakeStepStatus.Complete,
  EIntakeStepStatus.Skipped,
  EIntakeStepStatus.Waived,
  EIntakeStepStatus.Deferred,
]);

export function findStep(
  definition: IIntakeDefinition,
  key: string,
): IIntakeStepDefinition | null {
  return definition.steps.find((step) => step.key === key) ?? null;
}

export function startingPointConfig(
  definition: IIntakeDefinition,
  startingPoint: string,
): IIntakeStartingPointConfig | null {
  return definition.starting_points[startingPoint] ?? null;
}

/** Steps that apply to the chosen starting point, in definition order. */
export function applicableSteps(
  definition: IIntakeDefinition,
  startingPoint: string,
): IIntakeStepDefinition[] {
  return definition.steps.filter(
    (step) => step.applies_to === null || step.applies_to.includes(startingPoint),
  );
}

function isSettled(status: EIntakeStepStatus | undefined): boolean {
  return status !== undefined && SETTLED.has(status);
}

function prerequisitesMet(
  step: IIntakeStepDefinition,
  records: Record<string, IIntakeStepRecord>,
): boolean {
  return step.prerequisites.every((key) => isSettled(records[key]?.status));
}

/**
 * Derive each applicable step's effective status. Locked steps stay locked
 * even if a stale record claims otherwise — the definition wins.
 */
export function resolveStepStatuses(
  definition: IIntakeDefinition,
  state: Pick<IIntakeState, "starting_point" | "records">,
): Record<string, EIntakeStepStatus> {
  const applicable = applicableSteps(definition, state.starting_point);
  const out: Record<string, EIntakeStepStatus> = {};

  for (const step of definition.steps) {
    if (!applicable.includes(step)) {
      out[step.key] = EIntakeStepStatus.Skipped;
      continue;
    }
    const recorded = state.records[step.key]?.status;
    if (recorded === EIntakeStepStatus.Invalidated) {
      out[step.key] = EIntakeStepStatus.Invalidated;
      continue;
    }
    if (isSettled(recorded)) {
      out[step.key] = recorded!;
      continue;
    }
    if (!prerequisitesMet(step, state.records)) {
      out[step.key] = EIntakeStepStatus.Locked;
      continue;
    }
    if (recorded === EIntakeStepStatus.InProgress) {
      out[step.key] = EIntakeStepStatus.InProgress;
      continue;
    }
    out[step.key] = EIntakeStepStatus.Available;
  }

  return out;
}

export function progressOf(
  definition: IIntakeDefinition,
  state: IIntakeState,
): IIntakeProgress {
  const applicable = applicableSteps(definition, state.starting_point);
  const statuses = resolveStepStatuses(definition, state);
  const completed = applicable.filter((step) => isSettled(statuses[step.key])).length;
  const total = applicable.length;
  const config = startingPointConfig(definition, state.starting_point);

  let next_action: IIntakeProgress["next_action"] = null;
  if (state.current_step) {
    const step = findStep(definition, state.current_step);
    if (step && !isSettled(statuses[step.key])) {
      next_action = { step_key: step.key, label: step.label, execution: step.execution };
    }
  }
  if (!next_action) {
    const next = applicable.find(
      (step) =>
        statuses[step.key] === EIntakeStepStatus.Available ||
        statuses[step.key] === EIntakeStepStatus.InProgress ||
        statuses[step.key] === EIntakeStepStatus.Invalidated,
    );
    if (next) {
      next_action = { step_key: next.key, label: next.label, execution: next.execution };
    }
  }

  return {
    ratio: total === 0 ? 1 : completed / total,
    completed,
    total,
    next_action,
    reduced_automation: config?.reduced_automation ?? false,
    notice: config?.notice ?? null,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function record(
  status: EIntakeStepStatus,
  extras: Partial<IIntakeStepRecord> = {},
): IIntakeStepRecord {
  return {
    status,
    waiver_rationale: extras.waiver_rationale ?? null,
    analysis_ref: extras.analysis_ref ?? null,
    updated_at: extras.updated_at ?? nowIso(),
  };
}

/** Fresh state for a chosen starting point. Marks inapplicable steps skipped. */
export function initialIntakeState(
  definition: IIntakeDefinition,
  startingPoint: string,
  values: Record<string, unknown> = {},
): IIntakeState {
  const config = startingPointConfig(definition, startingPoint);
  if (!config) {
    throw new Error(
      `Starting point "${startingPoint}" is not defined for ${definition.solution_key}.`,
    );
  }
  const applicable = new Set(applicableSteps(definition, startingPoint).map((s) => s.key));
  const records: Record<string, IIntakeStepRecord> = {};
  for (const step of definition.steps) {
    if (!applicable.has(step.key)) {
      records[step.key] = record(EIntakeStepStatus.Skipped);
    }
  }
  return {
    solution_key: definition.solution_key,
    definition_version: definition.version,
    starting_point: startingPoint,
    current_step: config.first_step,
    records,
    values,
  };
}

export function beginStep(state: IIntakeState, stepKey: string): IIntakeState {
  return {
    ...state,
    current_step: stepKey,
    records: {
      ...state.records,
      [stepKey]: record(EIntakeStepStatus.InProgress, {
        analysis_ref: state.records[stepKey]?.analysis_ref ?? null,
      }),
    },
  };
}

/**
 * Settle a step as complete and advance. Refuses if prerequisites aren't met
 * or the step is locked for this starting point.
 */
export function completeStep(
  definition: IIntakeDefinition,
  state: IIntakeState,
  stepKey: string,
  values: Record<string, unknown> = {},
): IIntakeState {
  const step = requireApplicable(definition, state, stepKey);
  assertPrerequisites(step, state);
  const mergedValues = { ...state.values, ...values };
  const nextState: IIntakeState = {
    ...state,
    values: mergedValues,
    records: { ...state.records, [stepKey]: record(EIntakeStepStatus.Complete) },
  };
  return advance(definition, nextState, step);
}

/**
 * Bypass a required step. Refuses without a non-empty rationale — that is the
 * "permitted waiver" the acceptance criteria ask for.
 */
export function waiveStep(
  definition: IIntakeDefinition,
  state: IIntakeState,
  stepKey: string,
  rationale: string,
): IIntakeState {
  const step = requireApplicable(definition, state, stepKey);
  assertPrerequisites(step, state);
  const trimmed = rationale.trim();
  if (!trimmed) {
    throw new Error(`Waiving "${step.label}" requires a rationale.`);
  }
  if (!step.required && !step.deferrable) {
    // Non-required, non-deferrable steps are skipped by applicability, not waived.
  }
  const nextState: IIntakeState = {
    ...state,
    records: {
      ...state.records,
      [stepKey]: record(EIntakeStepStatus.Waived, { waiver_rationale: trimmed }),
    },
  };
  return advance(definition, nextState, step);
}

/** Defer a deferrable step without a waiver. Required non-deferrable steps refuse. */
export function deferStep(
  definition: IIntakeDefinition,
  state: IIntakeState,
  stepKey: string,
): IIntakeState {
  const step = requireApplicable(definition, state, stepKey);
  assertPrerequisites(step, state);
  if (!step.deferrable) {
    throw new Error(
      step.required
        ? `"${step.label}" is required and cannot be deferred — waive it with a rationale, or complete it.`
        : `"${step.label}" cannot be deferred.`,
    );
  }
  const nextState: IIntakeState = {
    ...state,
    records: { ...state.records, [stepKey]: record(EIntakeStepStatus.Deferred) },
  };
  return advance(definition, nextState, step);
}

/**
 * Patch values. Any material input that actually changed invalidates its step
 * and every downstream dependent, then rewinds `current_step` to the earliest
 * invalidated one so the user re-answers in order.
 */
export function patchValues(
  definition: IIntakeDefinition,
  state: IIntakeState,
  patch: Record<string, unknown>,
): IIntakeState {
  const changed = Object.keys(patch).filter((key) => state.values[key] !== patch[key]);
  const merged = { ...state.values, ...patch };
  if (changed.length === 0) return { ...state, values: merged };

  const invalidated = new Set<string>();
  for (const step of applicableSteps(definition, state.starting_point)) {
    if (step.material_inputs.some((key) => changed.includes(key))) {
      invalidated.add(step.key);
    }
  }
  // Cascade: anything that depended on an invalidated step is also invalid.
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of applicableSteps(definition, state.starting_point)) {
      if (invalidated.has(step.key)) continue;
      if (step.prerequisites.some((key) => invalidated.has(key))) {
        invalidated.add(step.key);
        grew = true;
      }
    }
  }

  const records = { ...state.records };
  for (const key of invalidated) {
    records[key] = record(EIntakeStepStatus.Invalidated);
  }

  const earliest = applicableSteps(definition, state.starting_point).find((step) =>
    invalidated.has(step.key),
  );

  return {
    ...state,
    values: merged,
    records,
    current_step: earliest?.key ?? state.current_step,
  };
}

/**
 * Preview what a starting-point switch would wipe, then optionally apply.
 * The UI must show `affected_*` before calling `changeStartingPoint`.
 */
export function previewStartingPointChange(
  definition: IIntakeDefinition,
  state: IIntakeState,
  nextStartingPoint: string,
): IStartingPointChangePreview {
  if (!startingPointConfig(definition, nextStartingPoint)) {
    throw new Error(
      `Starting point "${nextStartingPoint}" is not defined for ${definition.solution_key}.`,
    );
  }
  const nextApplicable = new Set(
    applicableSteps(definition, nextStartingPoint).map((s) => s.key),
  );
  const affected_steps = Object.entries(state.records)
    .filter(([key, rec]) => {
      if (!isSettled(rec.status) && rec.status !== EIntakeStepStatus.InProgress) return false;
      // Settled steps that no longer apply, or that stay but whose answers may
      // not make sense under the new path, are reported as affected.
      return !nextApplicable.has(key) || key !== "start";
    })
    .map(([key]) => key);

  return {
    from: state.starting_point,
    to: nextStartingPoint,
    affected_steps,
    affected_values: Object.keys(state.values),
  };
}

/** Apply a starting-point change after the user confirmed the preview. */
export function changeStartingPoint(
  definition: IIntakeDefinition,
  state: IIntakeState,
  nextStartingPoint: string,
): IIntakeState {
  previewStartingPointChange(definition, state, nextStartingPoint);
  // Fresh state keeps nothing from the previous path — the preview is the
  // warning; applying it is a reset, not a merge.
  return initialIntakeState(definition, nextStartingPoint, {});
}

function advance(
  definition: IIntakeDefinition,
  state: IIntakeState,
  _settled: IIntakeStepDefinition,
): IIntakeState {
  // Definition order is the source of truth for "what is next". A static
  // `step.next` cannot express path-specific branches (vision vs repository
  // after context); the earliest unlocked applicable step can.
  const statuses = resolveStepStatuses(definition, state);
  const next = applicableSteps(definition, state.starting_point).find(
    (step) =>
      statuses[step.key] === EIntakeStepStatus.Available ||
      statuses[step.key] === EIntakeStepStatus.Invalidated ||
      statuses[step.key] === EIntakeStepStatus.InProgress,
  );
  return { ...state, current_step: next?.key ?? null };
}

function requireApplicable(
  definition: IIntakeDefinition,
  state: IIntakeState,
  stepKey: string,
): IIntakeStepDefinition {
  const step = findStep(definition, stepKey);
  if (!step) throw new Error(`Unknown intake step "${stepKey}".`);
  const applicable = applicableSteps(definition, state.starting_point);
  if (!applicable.includes(step)) {
    throw new Error(
      `"${step.label}" does not apply to the "${state.starting_point}" starting point.`,
    );
  }
  return step;
}

function assertPrerequisites(step: IIntakeStepDefinition, state: IIntakeState) {
  if (!prerequisitesMet(step, state.records)) {
    throw new Error(`"${step.label}" is still locked — finish its prerequisites first.`);
  }
}

/** Look up a definition by solution key from a catalogue the caller supplies. */
export function intakeForSolution(
  catalogue: IIntakeDefinition[],
  solutionKey: ESolutionKey,
): IIntakeDefinition | null {
  return catalogue.find((def) => def.solution_key === solutionKey) ?? null;
}
