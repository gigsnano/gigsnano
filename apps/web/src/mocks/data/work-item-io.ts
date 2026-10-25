import type { IExportJob, IImportJob, IWorkItemImportPreview } from "@/types";
import { EExportStatus, EImportStatus } from "@/types";

// Fixed timestamps (no Date.now()) so offline-dev responses are deterministic.
const TS = "2026-07-12T09:00:00Z";
const EXPIRES_TS = "2026-07-19T09:00:00Z";

export const MOCK_IMPORT_PREVIEW: IWorkItemImportPreview = {
  rows_total: 3,
  to_create: 2,
  to_update: 1,
  errors: [{ row: 4, reason: "missing title" }],
  unmatched_assignees: ["ghost@nowhere.com"],
  unknown_labels: ["legacy"],
  sample: [
    { row: 2, code: null, title: "Checkout revamp", type: "epic", parent: null, assignee: null, action: "create" },
    { row: 3, code: null, title: "Add payment method", type: "story", parent: "Checkout revamp", assignee: "a@x.com", action: "create" },
    { row: 5, code: "WEB-12", title: "Existing item", type: "story", parent: null, assignee: null, action: "update" },
  ],
};

/**
 * Deterministic export-job fixture for the work-item Excel/CSV export flow
 * (GIN-75). Offline dev has no real file generation, so a READY job with a
 * stub `download_url` is enough to exercise the export dialog end to end.
 */
export function mockExportJob(
  status: EExportStatus = EExportStatus.Ready,
  workspaceSlug = "acme",
): IExportJob {
  const ready = status === EExportStatus.Ready;
  return {
    id: "exp_wi_mock",
    workspace_slug: workspaceSlug,
    name: "Work items export",
    format: "xlsx",
    status,
    download_url: ready ? "#mock-export-work-items.xlsx" : null,
    expires_at: ready ? EXPIRES_TS : null,
    created_at: TS,
  };
}

/**
 * Deterministic import-job fixture whose summary counts mirror
 * `MOCK_IMPORT_PREVIEW`, for the work-item Excel/CSV import flow (GIN-75).
 */
export function mockImportJob(
  status: EImportStatus = EImportStatus.Completed,
  workspaceSlug = "acme",
): IImportJob {
  const finished =
    status === EImportStatus.Completed || status === EImportStatus.CompletedWithErrors;
  return {
    id: "imp_wi_mock",
    workspace_slug: workspaceSlug,
    source_format: "xlsx",
    status,
    summary: finished
      ? {
          rows_total: MOCK_IMPORT_PREVIEW.rows_total,
          created: MOCK_IMPORT_PREVIEW.to_create,
          updated: MOCK_IMPORT_PREVIEW.to_update,
          skipped: 0,
          errors: MOCK_IMPORT_PREVIEW.errors,
          unmatched_assignees: MOCK_IMPORT_PREVIEW.unmatched_assignees,
          unknown_labels: MOCK_IMPORT_PREVIEW.unknown_labels,
        }
      : null,
    created_at: TS,
  };
}
