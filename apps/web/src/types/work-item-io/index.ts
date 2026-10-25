export interface IWorkItemExportFilters {
  status_in?: string[];
  priority_in?: string[];
  type_in?: string[];
  assignee_ids?: string[];
  label_ids?: string[];
}

export interface IWorkItemExportRequest {
  columns: string[];
  format: "xlsx" | "csv";
  scope: "all" | "view";
  filters?: IWorkItemExportFilters;
}

export interface IImportPreviewRow {
  row: number;
  code: string | null;
  title: string;
  type: string;
  parent: string | null;
  assignee: string | null;
  action: "create" | "update";
}

export interface IWorkItemImportPreview {
  rows_total: number;
  to_create: number;
  to_update: number;
  errors: { row: number | string; reason: string }[];
  unmatched_assignees: string[];
  unknown_labels: string[];
  sample: IImportPreviewRow[];
}
