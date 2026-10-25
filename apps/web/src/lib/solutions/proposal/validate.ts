import { ESolutionKey } from "@/types";
import {
  EProposalNodeKind,
  EProposalOrigin,
  EProposalStatus,
  type IProposalGap,
  type IProposalNode,
  type IProposalValidationIssue,
  type IProposalValidationResult,
  type IStructureProposal,
} from "@/types/solution/proposal";

/**
 * Structure proposal validation (GIN-449).
 *
 * Required fields are declared per solution rather than hardcoded per call
 * site, and nothing here invents default layers — a proposal with no evidence
 * for a frontend simply has no frontend node.
 */

type TRequiredField = {
  field: string;
  /** Read the value off a node; null/empty counts as missing. */
  read: (node: IProposalNode) => unknown;
  message: string;
  waivable: boolean;
};

const OWNER_FIELD: TRequiredField = {
  field: "owner_id",
  read: (node) => node.owner_id,
  message: "Assign an owner so this can be actioned after setup.",
  waivable: true,
};

const REQUIRED_BY_SOLUTION: Record<ESolutionKey, TRequiredField[]> = {
  [ESolutionKey.SoftwareDelivery]: [
    OWNER_FIELD,
    {
      field: "responsibility",
      read: (node) => node.attributes.responsibility,
      message: "Describe what this component is responsible for.",
      waivable: false,
    },
  ],
  [ESolutionKey.RevenueAssurance]: [
    OWNER_FIELD,
    {
      field: "coverage_period",
      read: (node) => node.attributes.coverage_period,
      message: "Set the period this source covers.",
      waivable: false,
    },
    {
      field: "identifiers",
      read: (node) => node.attributes.identifiers,
      message: "List the identifiers used to match records from this source.",
      waivable: true,
    },
  ],
};

const EXPECTED_KIND: Record<ESolutionKey, EProposalNodeKind> = {
  [ESolutionKey.SoftwareDelivery]: EProposalNodeKind.Component,
  [ESolutionKey.RevenueAssurance]: EProposalNodeKind.Source,
};

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isWaived(proposal: IStructureProposal, nodeKey: string, field: string): boolean {
  return proposal.waivers.some(
    (w) => w.node_key === nodeKey && w.field === field && w.rationale.trim() !== "",
  );
}

function detectCycles(
  nodes: IProposalNode[],
  issues: IProposalValidationIssue[],
): void {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const visiting = new Set<string>();
  const done = new Set<string>();

  const walk = (key: string, stack: string[]) => {
    if (done.has(key)) return;
    if (visiting.has(key)) {
      issues.push({
        node_key: key,
        code: "circular_dependency",
        message: `Circular dependency: ${[...stack, key].join(" → ")}.`,
      });
      return;
    }
    visiting.add(key);
    for (const dep of byKey.get(key)?.depends_on ?? []) {
      walk(dep, [...stack, key]);
    }
    visiting.delete(key);
    done.add(key);
  };

  for (const node of nodes) {
    for (const dep of node.depends_on) {
      if (!byKey.has(dep)) {
        issues.push({
          node_key: node.key,
          code: "unknown_dependency",
          message: `"${node.label}" depends on unknown node "${dep}".`,
        });
      }
    }
    walk(node.key, []);
  }
}

/**
 * Dependency + completeness validation. Gaps are separate from issues: an
 * unassigned owner is actionable, not structurally invalid.
 */
export function validateProposal(proposal: IStructureProposal): IProposalValidationResult {
  const issues: IProposalValidationIssue[] = [];
  const gaps: IProposalGap[] = [];

  if (proposal.nodes.length === 0) {
    issues.push({
      node_key: null,
      code: "empty_proposal",
      message: "A structure proposal needs at least one entry.",
    });
  }

  const seen = new Set<string>();
  for (const node of proposal.nodes) {
    if (seen.has(node.key)) {
      issues.push({
        node_key: node.key,
        code: "duplicate_key",
        message: `Duplicate logical key "${node.key}".`,
      });
    }
    seen.add(node.key);

    if (node.kind !== EXPECTED_KIND[proposal.solution_key]) {
      issues.push({
        node_key: node.key,
        code: "wrong_kind",
        message: `"${node.label}" is a ${node.kind}, which this solution does not use.`,
      });
    }

    if (node.origin === EProposalOrigin.Inferred && !node.provenance) {
      issues.push({
        node_key: node.key,
        code: "missing_provenance",
        message: `Inferred entry "${node.label}" must link to its source.`,
      });
    }

    for (const required of REQUIRED_BY_SOLUTION[proposal.solution_key] ?? []) {
      if (!isMissing(required.read(node))) continue;
      if (required.waivable && isWaived(proposal, node.key, required.field)) continue;
      gaps.push({
        node_key: node.key,
        field: required.field,
        message: `${node.label}: ${required.message}`,
        waivable: required.waivable,
      });
    }
  }

  detectCycles(proposal.nodes, issues);

  return { ok: issues.length === 0 && gaps.length === 0, issues, gaps };
}

/** Only a structurally valid, gap-free proposal may be approved. */
export function canApprove(proposal: IStructureProposal): boolean {
  if (proposal.status === EProposalStatus.Approved) return false;
  return validateProposal(proposal).ok;
}
