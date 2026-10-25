import type { ESolutionKey } from "./solution";

/**
 * Blueprint recommendation + editable installation plan (GIN-452).
 *
 * Recommendation and materialization are read-only: nothing is written until
 * the installer (GIN-453) runs the approved plan. Every planned object carries
 * a stable logical key and the blueprint that produced it.
 */

export enum EPlanGroup {
  Journey = "journey",
  Structure = "structure",
  Work = "work",
  Agents = "agents",
  Integrations = "integrations",
  Approvals = "approvals",
  Views = "views",
  Documents = "documents",
}

export enum EPlanItemState {
  /** Will be created. */
  Selected = "selected",
  /** Optional item the user turned off. */
  Deselected = "deselected",
  /** Required item bypassed with an explicit rationale. */
  Waived = "waived",
  /** Cannot be installed — see `blockers`. */
  Blocked = "blocked",
}

export interface IPlanWarning {
  code: string;
  message: string;
  /** What the user can do about it. Empty means informational only. */
  remediation: string | null;
}

export interface IPlanItem {
  /** Stable logical key, unique within the plan. */
  key: string;
  group: EPlanGroup;
  label: string;
  /** Blueprint that contributed this item. */
  source_blueprint_key: string;
  source_blueprint_version: number;
  required: boolean;
  state: EPlanItemState;
  /** Other plan item keys that must exist first. */
  depends_on: string[];
  /** Why the item is here — approved inference, parameter, or blueprint default. */
  provenance: string;
  warnings: IPlanWarning[];
  /** Populated when state is Blocked. */
  blockers: IPlanWarning[];
}

export interface IPlanCounts {
  total: number;
  selected: number;
  deselected: number;
  waived: number;
  blocked: number;
  by_group: Record<string, number>;
}

export interface IInstallPlan {
  id: string;
  workspace_slug: string;
  setup_draft_id: string;
  solution_key: ESolutionKey;
  blueprint_key: string;
  blueprint_version: number;
  /** Digest of the definition the plan was materialized from. */
  blueprint_digest: string;
  /** Resolved parameter values (user decisions + approved inference). */
  parameters: Record<string, unknown>;
  items: IPlanItem[];
  counts: IPlanCounts;
  warnings: IPlanWarning[];
  /** True when no item is blocked and every required item is settled. */
  installable: boolean;
  created_at: string;
}

/** Explainable signal behind a recommendation score. */
export interface IRecommendationSignal {
  code: string;
  label: string;
  /** Contribution to the score; negative values explain a downgrade. */
  weight: number;
}

export interface IBlueprintRecommendation {
  blueprint_key: string;
  blueprint_version: number;
  name: string;
  /** 0–1. Deterministic — the same evidence always ranks the same way. */
  score: number;
  /** Human-readable "why this fits". */
  rationale: string;
  signals: IRecommendationSignal[];
  /** False when a hard eligibility rule excluded it; `rationale` says why. */
  eligible: boolean;
}

export interface IRecommendationResult {
  /** Highest-scoring eligible blueprint, or null when only blank remains. */
  recommended: IBlueprintRecommendation | null;
  /** Every candidate, including ineligible ones, ranked. */
  alternatives: IBlueprintRecommendation[];
  /** Blank/custom is always offered. */
  blank_available: true;
}
