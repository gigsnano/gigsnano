import {
  EProposalStatus,
  type IProposalDiff,
  type IProposalImpactNotice,
  type IProposalNode,
  type IStructureProposal,
} from "@/types/solution/proposal";

import { canApprove } from "./validate";

/**
 * Proposal versioning (GIN-449).
 *
 * Approval freezes a version. Editing an approved proposal never mutates it —
 * it forks the next version and returns an impact notice naming what downstream
 * work was derived from the frozen one.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** Edit nodes on a draft proposal, or fork when the current one is approved. */
export function editNodes(
  proposal: IStructureProposal,
  nodes: IProposalNode[],
  actorId: string,
): { proposal: IStructureProposal; notice: IProposalImpactNotice | null } {
  if (proposal.status !== EProposalStatus.Approved) {
    return {
      proposal: {
        ...proposal,
        nodes,
        status: EProposalStatus.Edited,
        updated_at: nowIso(),
      },
      notice: null,
    };
  }

  const next: IStructureProposal = {
    ...proposal,
    id: `${proposal.id}.v${proposal.version + 1}`,
    version: proposal.version + 1,
    parent_version: proposal.version,
    status: EProposalStatus.Edited,
    nodes,
    approved_by: null,
    approved_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const diff = diffProposals(proposal, next);
  const affected = [
    ...diff.removed.map((key) => `Work derived from "${key}"`),
    ...Object.keys(diff.changed).map((key) => `Plan entries referencing "${key}"`),
  ];

  return {
    proposal: next,
    notice: {
      from_version: proposal.version,
      to_version: next.version,
      message: `Version ${proposal.version} was approved by ${actorId === proposal.approved_by ? "you" : "someone else"} and stays frozen. These edits create version ${next.version}.`,
      affected,
    },
  };
}

/** Freeze the current version. Refuses while validation still reports problems. */
export function approveProposal(
  proposal: IStructureProposal,
  actorId: string,
): IStructureProposal {
  if (!canApprove(proposal)) {
    throw new Error(
      "This proposal still has unresolved problems or gaps — fix or waive them before approving.",
    );
  }
  return {
    ...proposal,
    status: EProposalStatus.Approved,
    approved_by: actorId,
    approved_at: nowIso(),
    updated_at: nowIso(),
  };
}

/** Mark an older version replaced once a newer one is approved. */
export function supersede(proposal: IStructureProposal): IStructureProposal {
  return { ...proposal, status: EProposalStatus.Superseded, updated_at: nowIso() };
}

function changedFields(a: IProposalNode, b: IProposalNode): string[] {
  const fields: string[] = [];
  if (a.label !== b.label) fields.push("label");
  if (a.owner_id !== b.owner_id) fields.push("owner_id");
  if (JSON.stringify(a.depends_on) !== JSON.stringify(b.depends_on)) {
    fields.push("depends_on");
  }
  const keys = new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)]);
  for (const key of keys) {
    if (JSON.stringify(a.attributes[key]) !== JSON.stringify(b.attributes[key])) {
      fields.push(key);
    }
  }
  return fields;
}

/** Diff two versions — inferred vs edited vs approved all use this. */
export function diffProposals(
  from: IStructureProposal,
  to: IStructureProposal,
): IProposalDiff {
  const fromByKey = new Map(from.nodes.map((n) => [n.key, n]));
  const toByKey = new Map(to.nodes.map((n) => [n.key, n]));

  const added = to.nodes.filter((n) => !fromByKey.has(n.key)).map((n) => n.key);
  const removed = from.nodes.filter((n) => !toByKey.has(n.key)).map((n) => n.key);
  const changed: Record<string, string[]> = {};

  for (const node of to.nodes) {
    const before = fromByKey.get(node.key);
    if (!before) continue;
    const fields = changedFields(before, node);
    if (fields.length > 0) changed[node.key] = fields;
  }

  return { from_version: from.version, to_version: to.version, added, removed, changed };
}
