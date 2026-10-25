import { describe, expect, it } from "vitest";

import { ESolutionKey } from "@/types";
import {
  EBlueprintLifecycle,
  type IBlueprintDefinition,
} from "@/types/solution/blueprint";
import { EPlanGroup, EPlanItemState } from "@/types/solution/install-plan";

import {
  BLUEPRINT_FIXTURES,
  revenueAssuranceBlueprint,
  softwareDeliveryBlueprint,
} from "../blueprint";
import { CONNECTOR_FIXTURES } from "../connectors";
import {
  applyEdits,
  deselectItem,
  groupPlan,
  materializePlan,
  recommendBlueprints,
  reselectItem,
  resolveParameters,
  waiveItem,
  type IMaterializeContext,
  type IRecommendationEvidence,
} from "./index";

const SKILLS = ["bmad.analyst", "bmad.pm", "bmad.architect"];

function context(overrides: Partial<IMaterializeContext> = {}): IMaterializeContext {
  return {
    workspace_slug: "acme",
    setup_draft_id: "draft-1",
    connectors: CONNECTOR_FIXTURES,
    available_skill_refs: SKILLS,
    decided_parameters: {},
    inferred_parameters: {},
    ...overrides,
  };
}

function evidence(overrides: Partial<IRecommendationEvidence> = {}): IRecommendationEvidence {
  return {
    solution_key: ESolutionKey.SoftwareDelivery,
    solution_version: 1,
    journey_key: "idea",
    connected_connectors: ["github"],
    proposal_node_keys: ["delivery", "docs"],
    decided_parameters: [],
    ...overrides,
  };
}

describe("recommendBlueprints", () => {
  it("recommends the blueprint matching the journey and explains why", () => {
    const result = recommendBlueprints(BLUEPRINT_FIXTURES, evidence());

    expect(result.recommended?.blueprint_key).toBe("sd.greenfield.default");
    expect(result.recommended?.rationale).toContain("matches your setup path");
    expect(result.blank_available).toBe(true);
  });

  it("always offers the other candidates as alternatives", () => {
    const result = recommendBlueprints(BLUEPRINT_FIXTURES, evidence());

    expect(result.alternatives.map((a) => a.blueprint_key)).toContain("ra.diagnostic.default");
  });

  it("marks a different solution's blueprint ineligible with a reason", () => {
    const result = recommendBlueprints(BLUEPRINT_FIXTURES, evidence());
    const other = result.alternatives.find((a) => a.blueprint_key === "ra.diagnostic.default");

    expect(other?.eligible).toBe(false);
    expect(other?.rationale).toBe("Built for a different solution.");
    expect(other?.score).toBe(0);
  });

  it("never recommends a draft or revoked blueprint", () => {
    const draft: IBlueprintDefinition = {
      ...softwareDeliveryBlueprint,
      lifecycle: EBlueprintLifecycle.Draft,
    };

    const result = recommendBlueprints([draft], evidence());

    expect(result.recommended).toBeNull();
    expect(result.alternatives[0].eligible).toBe(false);
    expect(result.alternatives[0].rationale).toContain("draft");
  });

  it("rejects a blueprint needing a newer solution version", () => {
    const future: IBlueprintDefinition = {
      ...softwareDeliveryBlueprint,
      identity: { ...softwareDeliveryBlueprint.identity, solution_version_min: 5 },
    };

    const result = recommendBlueprints([future], evidence());

    expect(result.recommended).toBeNull();
    expect(result.alternatives[0].rationale).toContain("Requires solution version 5");
  });

  it("is deterministic — the same evidence always scores the same", () => {
    const first = recommendBlueprints(BLUEPRINT_FIXTURES, evidence());
    const second = recommendBlueprints(BLUEPRINT_FIXTURES, evidence());

    expect(first.recommended?.score).toBe(second.recommended?.score);
  });

  it("scores lower when the required integrations are not connected", () => {
    const connected = recommendBlueprints(BLUEPRINT_FIXTURES, evidence());
    const disconnected = recommendBlueprints(
      BLUEPRINT_FIXTURES,
      evidence({ connected_connectors: [] }),
    );

    expect(disconnected.recommended!.score).toBeLessThan(connected.recommended!.score);
    expect(disconnected.recommended!.signals.map((s) => s.code)).toContain(
      "connectors_missing",
    );
  });
});

describe("resolveParameters", () => {
  const parameterized: IBlueprintDefinition = {
    ...softwareDeliveryBlueprint,
    parameters: [
      { key: "team_size", label: "Team size", required: true, value_type: "number", default: 5 },
      { key: "repo", label: "Repository", required: true, value_type: "string", default: null },
    ],
  };

  it("prefers user decisions over inference over defaults", () => {
    const resolved = resolveParameters(
      parameterized,
      context({
        decided_parameters: { team_size: 9 },
        inferred_parameters: { team_size: 3, repo: "acme/web" },
      }),
    );

    expect(resolved.values).toEqual({ team_size: 9, repo: "acme/web" });
    expect(resolved.provenance.team_size).toBe("your answer during setup");
    expect(resolved.provenance.repo).toBe("approved inference");
  });

  it("warns with remediation when a required parameter has no value", () => {
    const resolved = resolveParameters(parameterized, context());

    expect(resolved.values).toEqual({ team_size: 5 });
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: "parameter_required", remediation: expect.any(String) }),
    ]);
  });
});

describe("materializePlan", () => {
  it("plans every object with a stable key, provenance and source blueprint", () => {
    const plan = materializePlan(softwareDeliveryBlueprint, context());

    expect(plan.counts.total).toBe(17);
    expect(plan.items.every((i) => i.source_blueprint_key === "sd.greenfield.default")).toBe(
      true,
    );
    expect(plan.items.every((i) => i.provenance.length > 0)).toBe(true);
    expect(new Set(plan.items.map((i) => i.key)).size).toBe(plan.items.length);
  });

  it("produces the same plan id and digest for the same inputs", () => {
    const a = materializePlan(softwareDeliveryBlueprint, context());
    const b = materializePlan(softwareDeliveryBlueprint, context());

    expect(a.id).toBe(b.id);
    expect(a.blueprint_digest).toBe(b.blueprint_digest);
    expect(a.items).toEqual(b.items);
  });

  it("carries work-graph dependencies into plan item keys", () => {
    const plan = materializePlan(softwareDeliveryBlueprint, context());
    const epics = plan.items.find((i) => i.key === "work:epics");

    expect(epics?.depends_on).toEqual(["work:prd", "work:architecture"]);
  });

  it("groups the preview in a stable order, skipping empty groups", () => {
    const groups = groupPlan(materializePlan(revenueAssuranceBlueprint, context()));

    expect(groups.map((g) => g.group)).toEqual([
      EPlanGroup.Journey,
      EPlanGroup.Structure,
      EPlanGroup.Work,
      EPlanGroup.Agents,
      EPlanGroup.Integrations,
      EPlanGroup.Approvals,
      EPlanGroup.Views,
      EPlanGroup.Documents,
    ]);
  });

  it("blocks install with remediation when a connector is unavailable", () => {
    const plan = materializePlan(
      softwareDeliveryBlueprint,
      context({ connectors: [] }),
    );
    const github = plan.items.find((i) => i.group === EPlanGroup.Integrations);

    expect(plan.installable).toBe(false);
    expect(github?.state).toBe(EPlanItemState.Blocked);
    expect(github?.blockers[0]).toMatchObject({
      code: "connector_unavailable",
      remediation: expect.any(String),
    });
  });

  it("blocks install when a connector cannot provide a required capability", () => {
    const readOnlyGithub = CONNECTOR_FIXTURES.map((c) =>
      c.key === "github"
        ? { ...c, capabilities: c.capabilities.filter((cap) => cap.key !== "repos.write") }
        : c,
    );

    const plan = materializePlan(
      softwareDeliveryBlueprint,
      context({ connectors: readOnlyGithub }),
    );
    const github = plan.items.find((i) => i.group === EPlanGroup.Integrations);

    expect(plan.installable).toBe(false);
    expect(github?.blockers[0].code).toBe("capability_unsupported");
    expect(github?.blockers[0].message).toContain("repos.write");
  });

  it("blocks install when an agent role needs an uninstalled skill profile", () => {
    const plan = materializePlan(
      softwareDeliveryBlueprint,
      context({ available_skill_refs: ["bmad.analyst"] }),
    );

    expect(plan.installable).toBe(false);
    expect(
      plan.items.filter((i) => i.state === EPlanItemState.Blocked).map((i) => i.label),
    ).toEqual(["Product Manager", "Architect"]);
  });

  it("is installable when everything resolves", () => {
    const plan = materializePlan(softwareDeliveryBlueprint, context());

    expect(plan.installable).toBe(true);
    expect(plan.counts.blocked).toBe(0);
  });
});

describe("editing a plan", () => {
  it("deselects an optional item and warns its dependents", () => {
    const base = materializePlan(softwareDeliveryBlueprint, context());
    const withDependency = {
      ...base,
      items: base.items.map((i) =>
        i.key === "documents:prd" ? { ...i, depends_on: ["views:board"] } : i,
      ),
    };

    const plan = deselectItem(withDependency, "views:board");

    expect(plan.items.find((i) => i.key === "views:board")?.state).toBe(
      EPlanItemState.Deselected,
    );
    expect(plan.items.find((i) => i.key === "documents:prd")?.warnings[0].code).toBe(
      "dependency_deselected",
    );
    expect(plan.counts.deselected).toBe(1);
  });

  it("clears the dependent warning when the item comes back", () => {
    const base = materializePlan(softwareDeliveryBlueprint, context());
    const withDependency = {
      ...base,
      items: base.items.map((i) =>
        i.key === "documents:prd" ? { ...i, depends_on: ["views:board"] } : i,
      ),
    };

    const plan = reselectItem(deselectItem(withDependency, "views:board"), "views:board");

    expect(plan.items.find((i) => i.key === "documents:prd")?.warnings).toEqual([]);
    expect(plan.counts.deselected).toBe(0);
  });

  it("refuses to deselect a required item", () => {
    const plan = materializePlan(softwareDeliveryBlueprint, context());

    expect(() => deselectItem(plan, "approvals:prd_signoff")).toThrow(/required/);
  });

  it("waives a required item with a recorded rationale", () => {
    const plan = waiveItem(
      materializePlan(softwareDeliveryBlueprint, context()),
      "approvals:prd_signoff",
      "Sign-off happens in the steering committee.",
    );
    const waived = plan.items.find((i) => i.key === "approvals:prd_signoff");

    expect(waived?.state).toBe(EPlanItemState.Waived);
    expect(waived?.provenance).toContain("waived: Sign-off happens");
    expect(plan.counts.waived).toBe(1);
    expect(plan.installable).toBe(true);
  });

  it("rejects a waiver with no reason", () => {
    const plan = materializePlan(softwareDeliveryBlueprint, context());

    expect(() => waiveItem(plan, "approvals:prd_signoff", "  ")).toThrow(/reason/);
  });

  it("replays edits onto a re-materialized plan so the preview stays live", () => {
    const plan = applyEdits(materializePlan(softwareDeliveryBlueprint, context()), {
      "views:board": { state: EPlanItemState.Deselected },
      "approvals:prd_signoff": { state: EPlanItemState.Waived, rationale: "Steering owns it." },
    });

    expect(plan.counts.deselected).toBe(1);
    expect(plan.counts.waived).toBe(1);
    expect(plan.installable).toBe(true);
  });

  it("drops edits that no longer apply instead of throwing", () => {
    const plan = applyEdits(materializePlan(softwareDeliveryBlueprint, context()), {
      "views:gone": { state: EPlanItemState.Deselected },
      "approvals:prd_signoff": { state: EPlanItemState.Waived, rationale: "" },
    });

    expect(plan.counts.deselected).toBe(0);
    expect(plan.counts.waived).toBe(0);
  });

  it("never lets a blocked item be waived past the gate", () => {
    const plan = materializePlan(softwareDeliveryBlueprint, context({ connectors: [] }));
    const blocked = plan.items.find((i) => i.state === EPlanItemState.Blocked)!;

    expect(() => waiveItem(plan, blocked.key, "We will connect it later.")).toThrow(
      /blocked/,
    );
  });
});
