import { describe, expect, it } from "vitest";

import { ESolutionKey } from "@/types";
import {
  EProposalNodeKind,
  EProposalOrigin,
  EProposalStatus,
  type IProposalNode,
  type IStructureProposal,
} from "@/types/solution/proposal";

import {
  approveProposal,
  canApprove,
  diffProposals,
  editNodes,
  validateProposal,
} from "./index";

function node(overrides: Partial<IProposalNode> = {}): IProposalNode {
  return {
    key: "api",
    kind: EProposalNodeKind.Component,
    label: "API service",
    origin: EProposalOrigin.Manual,
    confidence: null,
    provenance: null,
    depends_on: [],
    owner_id: "user-1",
    attributes: { responsibility: "Serves the REST API." },
    ...overrides,
  };
}

function proposal(overrides: Partial<IStructureProposal> = {}): IStructureProposal {
  return {
    id: "prop-1",
    workspace_slug: "acme",
    setup_draft_id: "draft-1",
    solution_key: ESolutionKey.SoftwareDelivery,
    version: 1,
    status: EProposalStatus.Inferred,
    nodes: [node()],
    waivers: [],
    approved_by: null,
    approved_at: null,
    parent_version: null,
    created_at: "2026-07-26T00:00:00.000Z",
    updated_at: "2026-07-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("validateProposal", () => {
  it("accepts a complete proposal", () => {
    expect(validateProposal(proposal()).ok).toBe(true);
  });

  it("reports a missing owner as an actionable, waivable gap", () => {
    const result = validateProposal(proposal({ nodes: [node({ owner_id: null })] }));

    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(0);
    expect(result.gaps).toEqual([
      expect.objectContaining({ node_key: "api", field: "owner_id", waivable: true }),
    ]);
  });

  it("clears a waivable gap once an explicit waiver exists", () => {
    const result = validateProposal(
      proposal({
        nodes: [node({ owner_id: null })],
        waivers: [
          {
            node_key: "api",
            field: "owner_id",
            rationale: "Owner assigned after launch.",
            waived_by: "user-1",
            waived_at: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("does not let a waiver clear a non-waivable field", () => {
    const result = validateProposal(
      proposal({
        nodes: [node({ attributes: {} })],
        waivers: [
          {
            node_key: "api",
            field: "responsibility",
            rationale: "Later.",
            waived_by: "user-1",
            waived_at: "2026-07-26T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.gaps).toEqual([
      expect.objectContaining({ field: "responsibility", waivable: false }),
    ]);
  });

  it("detects circular and unknown dependencies", () => {
    const result = validateProposal(
      proposal({
        nodes: [
          node({ key: "api", depends_on: ["web"] }),
          node({ key: "web", label: "Web app", depends_on: ["api", "ghost"] }),
        ],
      }),
    );

    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("circular_dependency");
    expect(codes).toContain("unknown_dependency");
  });

  it("requires provenance on inferred nodes", () => {
    const result = validateProposal(
      proposal({ nodes: [node({ origin: EProposalOrigin.Inferred, provenance: null })] }),
    );

    expect(result.issues.map((i) => i.code)).toContain("missing_provenance");
  });

  it("applies revenue-assurance requirements to revenue-assurance proposals", () => {
    const result = validateProposal(
      proposal({
        solution_key: ESolutionKey.RevenueAssurance,
        nodes: [
          node({
            key: "contracts",
            kind: EProposalNodeKind.Source,
            label: "Contracts",
            attributes: {},
          }),
        ],
      }),
    );

    const fields = result.gaps.map((g) => g.field);
    expect(fields).toContain("coverage_period");
    expect(fields).toContain("identifiers");
    expect(fields).not.toContain("responsibility");
  });

  it("rejects a node kind the solution does not use", () => {
    const result = validateProposal(
      proposal({
        solution_key: ESolutionKey.RevenueAssurance,
        nodes: [node({ kind: EProposalNodeKind.Component })],
      }),
    );

    expect(result.issues.map((i) => i.code)).toContain("wrong_kind");
  });

  it("forces no default layers — an empty proposal is invalid, not auto-filled", () => {
    const result = validateProposal(proposal({ nodes: [] }));

    expect(result.issues.map((i) => i.code)).toEqual(["empty_proposal"]);
  });
});

describe("approval and versioning", () => {
  it("refuses to approve while gaps remain", () => {
    const withGap = proposal({ nodes: [node({ owner_id: null })] });

    expect(canApprove(withGap)).toBe(false);
    expect(() => approveProposal(withGap, "user-1")).toThrow(/unresolved/);
  });

  it("freezes the version on approval", () => {
    const approved = approveProposal(proposal(), "user-1");

    expect(approved.status).toBe(EProposalStatus.Approved);
    expect(approved.approved_by).toBe("user-1");
    expect(canApprove(approved)).toBe(false);
  });

  it("edits a draft in place without forking", () => {
    const { proposal: edited, notice } = editNodes(
      proposal(),
      [node({ label: "Renamed" })],
      "user-1",
    );

    expect(edited.version).toBe(1);
    expect(edited.status).toBe(EProposalStatus.Edited);
    expect(notice).toBeNull();
  });

  it("forks a new version with an impact notice when an approved proposal is edited", () => {
    const approved = approveProposal(proposal(), "user-1");
    const { proposal: next, notice } = editNodes(
      approved,
      [node({ label: "API gateway" })],
      "user-1",
    );

    expect(next.version).toBe(2);
    expect(next.parent_version).toBe(1);
    expect(next.approved_by).toBeNull();
    expect(approved.status).toBe(EProposalStatus.Approved);
    expect(notice?.affected).toContain('Plan entries referencing "api"');
  });
});

describe("diffProposals", () => {
  it("reports added, removed and changed nodes", () => {
    const from = proposal();
    const to = proposal({
      version: 2,
      nodes: [
        node({ owner_id: "user-2", attributes: { responsibility: "Serves GraphQL." } }),
        node({ key: "worker", label: "Worker" }),
      ],
    });

    const diff = diffProposals(from, to);

    expect(diff.added).toEqual(["worker"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.api).toEqual(["owner_id", "responsibility"]);
  });
});
