import type { IInboxItem, TInboxAction } from "../types/inbox";

export interface IInboxRequest {
  method: "POST" | "PATCH";
  path: string;
  body: object;
}

/** The one place that maps an inbox action to an HTTP call; null when unsupported. */
export function inboxRequest(ws: string, item: IInboxItem, action: TInboxAction): IInboxRequest | null {
  const project = item.project_id ? `/workspaces/${ws}/projects/${item.project_id}` : null;
  const id = item.entity_id;

  if (item.kind === "director_action" && (action === "approve" || action === "reject")) {
    return project ? { method: "POST", path: `${project}/director-actions/${id}/${action}/`, body: { note: "" } } : null;
  }
  if (item.kind === "recovery_plan" && (action === "approve" || action === "reject")) {
    return project ? { method: "POST", path: `${project}/recovery-plans/${id}/${action}/`, body: {} } : null;
  }
  if (item.kind === "escalation" && action === "resolve") {
    return project ? { method: "POST", path: `${project}/escalations/${id}/resolve/`, body: { resolution: "" } } : null;
  }
  if (item.kind === "delegation_review" && action === "retry") {
    return project ? { method: "POST", path: `${project}/delegations/${id}/retry/`, body: {} } : null;
  }
  if ((item.kind === "assignment" || item.kind === "mention") && action === "open") {
    return { method: "PATCH", path: `/workspaces/${ws}/notifications/${id}/`, body: { read: true } };
  }
  return null;
}
