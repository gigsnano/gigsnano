import { APIError } from "@/services/api-error";
import type { IWorkflowRule } from "@/types";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

const rules: (IWorkflowRule & { project_id: string })[] = [
  {
    id: "wf_1",
    project_id: "prj_mba",
    from_status: "in_review",
    to_status: "done",
    approver_kind: "persona",
    approver_ref: "agent_qa",
    on_concerns: "block",
    enabled: true,
    created_at: "2026-07-15T09:00:00Z",
  },
];

let seq = rules.length;

function out(r: (typeof rules)[number]): IWorkflowRule {
  const { project_id: _p, ...wire } = r;
  void _p;
  return wire;
}

/** Workflow-gate rules per project (GIN-220/222). */
export function makeWorkflowHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/workflow-rules\/$/,
      resolve: ([, , projectId]) =>
        clone(rules.filter((r) => r.project_id === projectId).map(out)),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/workflow-rules\/$/,
      resolve: ([, , projectId], body) => {
        const b = (body ?? {}) as Partial<IWorkflowRule>;
        if (!b.to_status || !b.approver_kind || !b.approver_ref?.trim()) {
          throw new APIError(400, "to_status, approver_kind and approver_ref are required");
        }
        const created = {
          id: `wf_${++seq}`,
          project_id: projectId,
          from_status: b.from_status ?? "",
          to_status: b.to_status,
          approver_kind: b.approver_kind,
          approver_ref: b.approver_ref.trim(),
          on_concerns: b.on_concerns ?? "block",
          enabled: b.enabled ?? true,
          created_at: new Date().toISOString(),
        };
        rules.push(created);
        return clone(out(created));
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/workflow-rules\/([^/]+)\/$/,
      resolve: ([, , projectId, id]) => {
        const i = rules.findIndex((r) => r.project_id === projectId && r.id === id);
        if (i === -1) throw new APIError(404, "Rule not found");
        rules.splice(i, 1);
        return { success: true };
      },
    },
  ];
}
