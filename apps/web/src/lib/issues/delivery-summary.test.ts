import { describe, expect, it } from "vitest";

import {
  ECiState,
  EMergeState,
  EReviewState,
  type IDeliveryBundle,
  type IDeliveryRepo,
  type TDeliveryState,
} from "@/types";

import { deliverySummary, deliveryTabBadge, supportsCodeDelivery } from "./delivery-summary";

const repo = (patch: Partial<IDeliveryRepo> = {}): IDeliveryRepo =>
  ({
    project_repository_id: patch.project_repository_id ?? "r1",
    ci_state: ECiState.None,
    review_state: EReviewState.None,
    merge_state: EMergeState.Pending,
    no_change: false,
    ...patch,
  }) as IDeliveryRepo;

const bundle = (
  overall_state: TDeliveryState,
  repositories: IDeliveryRepo[] = [],
  extra: Partial<IDeliveryBundle> = {},
): IDeliveryBundle =>
  ({
    overall_state,
    repositories,
    blocking_repo_ids: [],
    cancelled: false,
    ...extra,
  }) as IDeliveryBundle;

describe("deliverySummary", () => {
  it("counts failed checks, requested changes and blockers separately", () => {
    const s = deliverySummary(
      bundle(
        "in_development",
        [
          repo({ ci_state: ECiState.Failed }),
          repo({ project_repository_id: "r2", review_state: EReviewState.ChangesRequested }),
          repo({ project_repository_id: "r3", ci_state: ECiState.Passed }),
        ],
        { blocking_repo_ids: ["r1", "r2"] },
      ),
    );
    expect(s).toMatchObject({
      failedChecks: 1,
      changesRequested: 1,
      blocking: 2,
      repoCount: 3,
    });
  });

  it("reports zeroes for a clean bundle", () => {
    const s = deliverySummary(bundle("released", [repo({ ci_state: ECiState.Passed })]));
    expect(s).toMatchObject({ failedChecks: 0, changesRequested: 0, blocking: 0 });
  });
});

describe("deliveryTabBadge", () => {
  it("says nothing without a bundle", () => {
    expect(deliveryTabBadge(undefined)).toBeNull();
  });

  it("says nothing once released or cancelled", () => {
    expect(deliveryTabBadge(bundle("released"))).toBeNull();
    expect(deliveryTabBadge(bundle("in_development", [], { cancelled: true }))).toBeNull();
  });

  it("never reports a bare repository count", () => {
    // Three healthy repos is not news.
    expect(deliveryTabBadge(bundle("in_development", [repo(), repo(), repo()]))).toBeNull();
  });

  it("ranks rollback above a failing check", () => {
    expect(
      deliveryTabBadge(bundle("rollback_required", [repo({ ci_state: ECiState.Failed })])),
    ).toBe("Rollback");
  });

  it("counts failing checks", () => {
    expect(
      deliveryTabBadge(
        bundle("in_development", [
          repo({ ci_state: ECiState.Failed }),
          repo({ project_repository_id: "r2", ci_state: ECiState.Failed }),
        ]),
      ),
    ).toBe("2 failed");
  });

  it("falls through to review, then to ready-to-merge", () => {
    expect(
      deliveryTabBadge(bundle("in_development", [repo({ review_state: EReviewState.ChangesRequested })])),
    ).toBe("Changes requested");
    expect(deliveryTabBadge(bundle("ready_to_merge", [repo()]))).toBe("Ready to merge");
  });
});

describe("supportsCodeDelivery", () => {
  it("offers code delivery when the project has a repository", () => {
    expect(supportsCodeDelivery({ cloneStatus: "ready", hasBundle: false })).toBe(true);
  });

  it("does not offer it when the project has no repository", () => {
    expect(supportsCodeDelivery({ cloneStatus: "none", hasBundle: false })).toBe(false);
    expect(supportsCodeDelivery({ cloneStatus: null, hasBundle: false })).toBe(false);
    expect(supportsCodeDelivery({ cloneStatus: undefined, hasBundle: false })).toBe(false);
  });

  it("keeps showing an existing bundle whatever the project says now", () => {
    // Never hide records that already exist.
    expect(supportsCodeDelivery({ cloneStatus: "failed", hasBundle: true })).toBe(true);
  });
});
