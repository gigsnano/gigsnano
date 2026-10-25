import type { ESolutionKey } from "./solution";

/**
 * Versioned intake definition + runtime state (GIN-444).
 *
 * The definition is solution-owned data: which steps exist, which starting
 * points they apply to, and how they transition. The *state* is what a setup
 * draft persists — step attempts, decisions, waivers and analysis — separately
 * from any UI route, so a refresh or a different client can resume exactly.
 *
 * The server is the source of truth for "what is next". These types and the
 * pure machine in `lib/solutions/intake/` are the contract the frontend (and
 * eventually the Python API) share; the client must never invent a step the
 * machine would not unlock.
 */

/** How a step is run once it becomes current. */
export enum EIntakeExecution {
  /** User fills a form; no background work. */
  Form = "form",
  /** A long-running analysis job; the step stays open until it settles. */
  Analysis = "analysis",
  /** Connect an integration / authorize a source. */
  Connect = "connect",
  /** Review-and-confirm gate before something irreversible. */
  Review = "review",
}

export enum EIntakeStepStatus {
  Locked = "locked",
  Available = "available",
  InProgress = "in_progress",
  Complete = "complete",
  /** Skipped because the starting point made it inapplicable. */
  Skipped = "skipped",
  /** Deferred by the user (only when the definition allows). */
  Deferred = "deferred",
  /** Bypassed with an explicit waiver. */
  Waived = "waived",
  /** Invalidated because a material upstream answer changed. */
  Invalidated = "invalidated",
}

/** One step in a solution's intake. Keys are stable across versions. */
export interface IIntakeStepDefinition {
  key: string;
  label: string;
  description: string;
  execution: EIntakeExecution;
  /**
   * Starting-point keys this step applies to. `null` means every starting
   * point of the solution. An empty array is invalid.
   */
  applies_to: string[] | null;
  /** Steps that must be settled (complete / skipped / waived) before this unlocks. */
  prerequisites: string[];
  /** Cannot be skipped without a permitted waiver. */
  required: boolean;
  /** User may defer and come back later without a waiver. */
  deferrable: boolean;
  /**
   * Value keys whose change invalidates this step and everything downstream.
   * Changing an immaterial answer must not wipe later work.
   */
  material_inputs: string[];
  /** Default next step when this one settles. `null` = intake finished. */
  next: string | null;
}

/** Per-starting-point entry: first step + soft flags the wizard can surface. */
export interface IIntakeStartingPointConfig {
  first_step: string;
  /**
   * Blank / reduced-automation paths explain the trade-off rather than
   * blocking — the machine still advances, the UI shows the notice.
   */
  reduced_automation: boolean;
  notice: string | null;
}

/**
 * Versioned intake for one solution. Bumped whenever steps/transitions change
 * so a draft written against an older version can be re-validated (same rule
 * as `ISolutionDefinition.version`).
 */
export interface IIntakeDefinition {
  solution_key: ESolutionKey;
  version: number;
  starting_points: Record<string, IIntakeStartingPointConfig>;
  steps: IIntakeStepDefinition[];
}

/** One recorded attempt / decision against a step. */
export interface IIntakeStepRecord {
  status: EIntakeStepStatus;
  /** Why a required step was waived; required when status is `waived`. */
  waiver_rationale: string | null;
  /** Opaque analysis / job handle when execution is `analysis`. */
  analysis_ref: string | null;
  updated_at: string;
}

/**
 * The resumable intake state persisted on a setup draft (or returned by the
 * server's next-step endpoint). Opaque to UI routes — the machine owns it.
 */
export interface IIntakeState {
  solution_key: ESolutionKey;
  /** Definition version this state was written against. */
  definition_version: number;
  starting_point: string;
  /** The step the user should be on. Server-authoritative. */
  current_step: string | null;
  records: Record<string, IIntakeStepRecord>;
  /** Collected answers so far (mirrors `ISetupDraft.values`). */
  values: Record<string, unknown>;
}

/** What the UI needs to render progress without inventing transitions. */
export interface IIntakeProgress {
  /** Settled steps / applicable steps, 0–1. */
  ratio: number;
  completed: number;
  total: number;
  /** The single recommended next action, or null when intake is finished. */
  next_action: {
    step_key: string;
    label: string;
    execution: EIntakeExecution;
  } | null;
  reduced_automation: boolean;
  notice: string | null;
}

/** Result of proposing a starting-point change before resetting. */
export interface IStartingPointChangePreview {
  from: string;
  to: string;
  /** Steps whose recorded answers would be wiped. */
  affected_steps: string[];
  /** Value keys that would be cleared. */
  affected_values: string[];
}
