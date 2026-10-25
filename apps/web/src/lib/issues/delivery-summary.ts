import {
  ECiState,
  EReviewState,
  type IDeliveryBundle,
  type TDeliveryState,
} from "@/types";

/**
 * What the Delivery tab needs to say at a glance (GIN-483). Pure, so the badge
 * and the warnings can be trusted without mounting the table.
 */
export interface IDeliverySummary {
  state: TDeliveryState;
  /** Repos whose CI failed — the thing a reader most needs to know. */
  failedChecks: number;
  /** Repos where a reviewer asked for changes. */
  changesRequested: number;
  /** Required repos not yet merged; these block marking the item Done. */
  blocking: number;
  repoCount: number;
}

export function deliverySummary(bundle: IDeliveryBundle): IDeliverySummary {
  const repos = bundle.repositories;
  return {
    state: bundle.overall_state,
    failedChecks: repos.filter((r) => r.ci_state === ECiState.Failed).length,
    changesRequested: repos.filter((r) => r.review_state === EReviewState.ChangesRequested).length,
    blocking: bundle.blocking_repo_ids.length,
    repoCount: repos.length,
  };
}

/**
 * The Delivery tab badge, or null when there is nothing worth saying.
 *
 * Ranked by what stops the work, not by what happened most recently. Never a
 * zero and never a bare count of repositories — "Delivery · 3" tells a reader
 * nothing they can act on.
 */
export function deliveryTabBadge(bundle: IDeliveryBundle | undefined): string | null {
  if (!bundle || bundle.cancelled) return null;
  const s = deliverySummary(bundle);
  if (s.state === "rollback_required") return "Rollback";
  if (s.failedChecks > 0) return `${s.failedChecks} failed`;
  if (s.changesRequested > 0) return "Changes requested";
  if (s.state === "ready_to_merge") return "Ready to merge";
  if (s.state === "released") return null;
  return null;
}

/**
 * Whether this work item's delivery can be code at all.
 *
 * The signal is the PROJECT, not the work item: with no repository connected
 * there is no branch to cut, so offering "start a coordinated branch across
 * your Write repositories" to someone tracking a design review or an ops task
 * is an empty gesture. Those items deliver documents and evidence instead.
 */
export function supportsCodeDelivery({
  cloneStatus,
  hasBundle,
}: {
  cloneStatus: string | null | undefined;
  hasBundle: boolean;
}): boolean {
  // An existing bundle wins over the project signal — never hide records that
  // already exist just because the project's clone state changed later.
  return hasBundle || cloneStatus === "ready";
}
