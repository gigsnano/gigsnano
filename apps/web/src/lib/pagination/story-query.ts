import type { EStoryPriority, EStoryStatus, EStoryType } from "@/types";

import { appendOffsetPageParams } from "./offset-query";

type TStoryListFilters = {
  q?: string;
  status?: EStoryStatus;
  status_in?: EStoryStatus[];
  priority_in?: EStoryPriority[];
  type_in?: EStoryType[];
  product_only?: boolean;
  unassigned?: boolean;
  unassigned_only?: boolean;
  cycle_id?: string;
  module_id?: string;
  assignee_id?: string;
  label_id?: string;
  target_date_from?: string;
  target_date_to?: string;
  scheduled_only?: boolean;
  /** `"manual"`, or signed field list (`"-priority,target_date"`). */
  order_by?: string;
  gigsql?: string;
  open_only?: boolean;
  /** Only items the caller subscribes to (server reads the session user). */
  watching?: boolean;
  /** Narrow to these projects (the dashboard-wide filter). */
  project_ids?: string[];
  limit?: number;
  offset?: number;
};

function appendCsv(qs: URLSearchParams, key: string, values: string[] | undefined): void {
  if (values?.length) qs.set(key, values.join(","));
}

/** Append story list query params to a URLSearchParams instance. */
export function appendStoryListParams(qs: URLSearchParams, filters: TStoryListFilters): void {
  if (filters.q) qs.set("q", filters.q);
  if (filters.status) qs.set("status", filters.status);
  appendCsv(qs, "status_in", filters.status_in);
  appendCsv(qs, "priority_in", filters.priority_in);
  appendCsv(qs, "type_in", filters.type_in);
  if (filters.product_only) qs.set("product_only", "true");
  if (filters.unassigned) qs.set("unassigned", "true");
  if (filters.unassigned_only) qs.set("unassigned_only", "true");
  if (filters.cycle_id) qs.set("cycle_id", filters.cycle_id);
  if (filters.module_id) qs.set("module_id", filters.module_id);
  if (filters.assignee_id) qs.set("assignee_id", filters.assignee_id);
  if (filters.label_id) qs.set("label_id", filters.label_id);
  if (filters.target_date_from) qs.set("target_date_from", filters.target_date_from);
  if (filters.target_date_to) qs.set("target_date_to", filters.target_date_to);
  if (filters.scheduled_only) qs.set("scheduled_only", "true");
  if (filters.watching) qs.set("watching", "true");
  appendCsv(qs, "project_ids", filters.project_ids);
  if (filters.order_by && filters.order_by !== "manual") qs.set("order_by", filters.order_by);
  if (filters.gigsql) qs.set("gigsql", filters.gigsql);
  if (filters.open_only === false) qs.set("open_only", "false");
  appendOffsetPageParams(qs, filters);
}
