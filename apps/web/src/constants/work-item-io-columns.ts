export interface IWorkItemIoColumn {
  key: string;
  label: string;
  default: boolean;
}

/** Mirrors the backend column registry (features/work_item_io/columns.py). */
export const WORK_ITEM_IO_COLUMNS: IWorkItemIoColumn[] = [
  { key: "code", label: "Code", default: true },
  { key: "title", label: "Title", default: true },
  { key: "type", label: "Type", default: true },
  { key: "parent", label: "Parent", default: true },
  { key: "status", label: "Status", default: true },
  { key: "priority", label: "Priority", default: true },
  { key: "assignee", label: "Assignee", default: true },
  { key: "labels", label: "Labels", default: true },
  { key: "start_date", label: "Start date", default: true },
  { key: "target_date", label: "Target date", default: true },
  { key: "estimate", label: "Estimate", default: true },
  { key: "description", label: "Description", default: true },
];

export const DEFAULT_EXPORT_KEYS = WORK_ITEM_IO_COLUMNS.flatMap((c) => (c.default ? [c.key] : []));
