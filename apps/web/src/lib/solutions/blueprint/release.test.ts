import { describe, expect, it } from "vitest";

import { ESolutionCapability } from "@/types";
import { EBlueprintLifecycle, type IBlueprintDefinition } from "@/types/solution/blueprint";
import {
  EBlueprintAuditAction,
  EBlueprintRole,
  type IBlueprintActor,
  type IBlueprintInstallation,
} from "@/types/solution/blueprint-release";

import { CONNECTOR_FIXTURES } from "../connectors";
import { softwareDeliveryBlueprint } from "./fixtures";
import {
  canSubmitForReview,
  checkCompatibility,
  cloneBlueprint,
  editDraft,
  editReleased,
  impactOf,
  isReleased,
  previewInstall,
  PREVIEW_CONTEXT,
  releaseTimeline,
  transitionBlockedReason,
  transitionBlueprint,
  validateForRelease,
  type ICompatibilityInput,
} from "./release";

const SKILLS = ["bmad.analyst", "bmad.pm", "bmad.architect"];

const author: IBlueprintActor = { id: "u-author", roles: [EBlueprintRole.Author] };
const reviewer: IBlueprintActor = { id: "u-reviewer", roles: [EBlueprintRole.Reviewer] };
const publisher: IBlueprintActor = { id: "u-publisher", roles: [EBlueprintRole.Publisher] };

function input(overrides: Partial<ICompatibilityInput> = {}): ICompatibilityInput {
  return {
    connectors: CONNECTOR_FIXTURES,
    available_skill_refs: SKILLS,
    solution_capabilities: [ESolutionCapability.Journeys, ESolutionCapability.Integrations],
    ...overrides,
  };
}

function draft(overrides: Partial<IBlueprintDefinition> = {}): IBlueprintDefinition {
  return { ...softwareDeliveryBlueprint, lifecycle: EBlueprintLifecycle.Draft, ...overrides };
}

describe("permission model", () => {
  it("only lets a publisher release a validated blueprint", () => {
    const validated = draft({ lifecycle: EBlueprintLifecycle.Validated });

    expect(
      transitionBlockedReason(validated, EBlueprintLifecycle.Approved, publisher),
    ).toBeNull();
    expect(transitionBlockedReason(validated, EBlueprintLifecycle.Approved, author)).toMatch(
      /Only a publisher/,
    );
    expect(transitionBlockedReason(validated, EBlueprintLifecycle.Approved, reviewer)).toMatch(
      /Only a publisher/,
    );
  });

  it("only lets an author move a draft forward", () => {
    expect(transitionBlockedReason(draft(), EBlueprintLifecycle.Validated, author)).toBeNull();
    expect(transitionBlockedReason(draft(), EBlueprintLifecycle.Validated, publisher)).toMatch(
      /Only a author/,
    );
  });

  it("refuses to skip straight from draft to released", () => {
    expect(transitionBlockedReason(draft(), EBlueprintLifecycle.Approved, publisher)).toMatch(
      /cannot move to approved/,
    );
  });

  it("treats revoked as terminal", () => {
    const revoked = draft({ lifecycle: EBlueprintLifecycle.Revoked });

    expect(transitionBlockedReason(revoked, EBlueprintLifecycle.Approved, publisher)).toMatch(
      /cannot move/,
    );
  });

  it("throws rather than performing a forbidden transition", () => {
    expect(() =>
      transitionBlueprint(
        draft({ lifecycle: EBlueprintLifecycle.Validated }),
        EBlueprintLifecycle.Approved,
        author,
      ),
    ).toThrow(/Only a publisher/);
  });
});

describe("immutability of released versions", () => {
  const released = draft({ lifecycle: EBlueprintLifecycle.Approved });

  it("recognizes released lifecycles", () => {
    expect(isReleased(released)).toBe(true);
    expect(isReleased(draft())).toBe(false);
  });

  it("refuses an in-place edit of a released version", () => {
    expect(() => editDraft(released, { journey_ref: "other" }, author)).toThrow(/immutable/);
  });

  it("forks the next draft version instead of mutating the release", () => {
    const { definition, entry } = editReleased(released, { journey_ref: "repository" }, author);

    expect(definition.identity.version).toBe(released.identity.version + 1);
    expect(definition.identity.key).toBe(released.identity.key);
    expect(definition.lifecycle).toBe(EBlueprintLifecycle.Draft);
    expect(released.lifecycle).toBe(EBlueprintLifecycle.Approved);
    expect(entry.detail).toMatch(/Forked v2 from released v1/);
  });

  it("does not let a fork silently change the blueprint key", () => {
    const { definition } = editReleased(
      released,
      { identity: { ...released.identity, key: "sneaky" } },
      author,
    );

    expect(definition.identity.key).toBe(released.identity.key);
  });

  it("edits a draft in place", () => {
    const { definition } = editDraft(draft(), { journey_ref: "repository" }, author);

    expect(definition.identity.version).toBe(1);
    expect(definition.journey_ref).toBe("repository");
  });

  it("clones under a new key as a fresh v1 draft", () => {
    const { definition, entry } = cloneBlueprint(
      draft({ lifecycle: EBlueprintLifecycle.Approved }),
      "sd.greenfield.acme",
      "Acme greenfield",
      author,
    );

    expect(definition.identity.key).toBe("sd.greenfield.acme");
    expect(definition.identity.version).toBe(1);
    expect(definition.lifecycle).toBe(EBlueprintLifecycle.Draft);
    expect(entry.action).toBe(EBlueprintAuditAction.Cloned);
  });

  it("only lets an author clone", () => {
    expect(() => cloneBlueprint(draft(), "x", "X", publisher)).toThrow(/Only an author/);
  });
});

describe("validateForRelease", () => {
  it("passes a complete, compatible definition", () => {
    const report = validateForRelease(draft(), input());

    expect(report.errors).toEqual([]);
    expect(report.compatibility.compatible).toBe(true);
    expect(report.releasable).toBe(true);
    expect(report.digest).not.toBeNull();
  });

  it("catches a missing connector", () => {
    const report = validateForRelease(draft(), input({ connectors: [] }));

    expect(report.errors.map((e) => e.code)).toContain("connector_missing");
    expect(report.releasable).toBe(false);
  });

  it("catches a connector that cannot provide a required scope", () => {
    const readOnly = CONNECTOR_FIXTURES.map((c) =>
      c.key === "github"
        ? { ...c, capabilities: c.capabilities.filter((cap) => cap.key !== "repos.write") }
        : c,
    );
    const report = validateForRelease(draft(), input({ connectors: readOnly }));

    expect(report.compatibility.missing_capabilities.github).toEqual(["repos.write"]);
    expect(report.errors.map((e) => e.code)).toContain("connector_scope_missing");
  });

  it("catches an uninstalled skill profile", () => {
    const report = validateForRelease(draft(), input({ available_skill_refs: [] }));

    expect(report.compatibility.missing_skills).toEqual([
      "bmad.analyst",
      "bmad.pm",
      "bmad.architect",
    ]);
    expect(report.releasable).toBe(false);
  });

  it("catches a solution capability the solution does not have", () => {
    const report = validateForRelease(
      draft(),
      input({
        solution_capabilities: [ESolutionCapability.Journeys],
        required_solution_capabilities: [ESolutionCapability.Repositories],
      }),
    );

    expect(report.errors.map((e) => e.code)).toContain("solution_capability_missing");
  });

  it("catches a circular work dependency from the schema validator", () => {
    const cyclic = draft({
      work_graph: [
        { key: "a", label: "A", depends_on: ["b"] },
        { key: "b", label: "B", depends_on: ["a"] },
      ],
    });
    const report = validateForRelease(cyclic, input());

    expect(report.errors.some((e) => e.code.includes("cycle") || e.code.includes("circular"))).toBe(
      true,
    );
    expect(report.releasable).toBe(false);
  });

  it("blocks submission for review while errors remain", () => {
    const report = validateForRelease(draft(), input({ connectors: [] }));

    expect(canSubmitForReview(draft(), report, author)).toBe(false);
  });

  it("allows submission when the report is clean and the actor is an author", () => {
    const report = validateForRelease(draft(), input());

    expect(canSubmitForReview(draft(), report, author)).toBe(true);
    expect(canSubmitForReview(draft(), report, publisher)).toBe(false);
  });
});

describe("previewInstall", () => {
  it("runs against a synthetic fixture without touching a workspace", () => {
    const plan = previewInstall(draft(), input());

    expect(plan.workspace_slug).toBe(PREVIEW_CONTEXT.workspace_slug);
    expect(plan.setup_draft_id).toBe(PREVIEW_CONTEXT.setup_draft_id);
    expect(plan.items.length).toBeGreaterThan(0);
  });

  it("shows the blockers a real install would hit", () => {
    const plan = previewInstall(draft(), input({ connectors: [] }));

    expect(plan.installable).toBe(false);
    expect(plan.counts.blocked).toBeGreaterThan(0);
  });
});

describe("deprecate and revoke impact", () => {
  const installations: IBlueprintInstallation[] = [
    {
      install_id: "i-1",
      container_id: "proj-1",
      container_label: "Acme Web",
      workspace_slug: "acme",
      blueprint_version: 1,
      installed_at: "2026-07-01T00:00:00.000Z",
    },
    {
      install_id: "i-2",
      container_id: "proj-2",
      container_label: "Future",
      workspace_slug: "acme",
      blueprint_version: 4,
      installed_at: "2026-07-02T00:00:00.000Z",
    },
  ];

  it("lists the affected installations at or below this version", () => {
    const impact = impactOf(
      draft({ lifecycle: EBlueprintLifecycle.Approved }),
      EBlueprintLifecycle.Revoked,
      installations,
    );

    expect(impact.installations.map((i) => i.install_id)).toEqual(["i-1"]);
    expect(impact.consequence).toMatch(/no longer be installed/);
  });

  it("explains that deprecation leaves installs working", () => {
    const impact = impactOf(
      draft({ lifecycle: EBlueprintLifecycle.Approved }),
      EBlueprintLifecycle.Deprecated,
      installations,
    );

    expect(impact.consequence).toMatch(/keep working/);
  });
});

describe("audit", () => {
  it("records every lifecycle step with the actor and digest", () => {
    const validated = transitionBlueprint(draft(), EBlueprintLifecycle.Validated, author);
    const published = transitionBlueprint(
      validated.definition,
      EBlueprintLifecycle.Approved,
      publisher,
    );
    const deprecated = transitionBlueprint(
      published.definition,
      EBlueprintLifecycle.Deprecated,
      publisher,
    );

    const timeline = releaseTimeline([
      deprecated.entry,
      validated.entry,
      published.entry,
    ]);

    expect(timeline.map((e) => e.action)).toEqual([
      EBlueprintAuditAction.Validated,
      EBlueprintAuditAction.Published,
      EBlueprintAuditAction.Deprecated,
    ]);
    expect(timeline.every((e) => e.digest.length > 0)).toBe(true);
    expect(timeline[1].actor_id).toBe("u-publisher");
  });

  it("records draft edits", () => {
    const { entry } = editDraft(draft(), { journey_ref: "repository" }, author);

    expect(entry.action).toBe(EBlueprintAuditAction.DraftEdited);
    expect(entry.actor_id).toBe("u-author");
  });
});

describe("checkCompatibility", () => {
  it("reports compatible when everything resolves", () => {
    expect(checkCompatibility(draft(), input()).compatible).toBe(true);
  });
});
