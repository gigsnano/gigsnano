import { EExportStatus, EImportStatus } from "@/types";

import { MOCK_IMPORT_PREVIEW, mockExportJob, mockImportJob } from "../data/work-item-io";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown, query: URLSearchParams) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Work-item Excel/CSV import + export (GIN-75) — offline-dev handlers so the
 * import/export dialogs work with `NEXT_PUBLIC_USE_MOCKS=true` and no backend.
 * Mirrors the workspace-level `/exports/` + `/imports/` mock handlers in
 * `../index.ts`, scoped instead to a single project's work items.
 */
export function makeWorkItemIoHandlers(): Handler[] {
  return [
    {
      method: "POST",
      pattern: /^\/workspaces\/[^/]+\/projects\/[^/]+\/work-items\/export\/$/,
      resolve: () => clone(mockExportJob()),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/[^/]+\/projects\/[^/]+\/work-items\/import\/validate\/$/,
      resolve: () => clone(MOCK_IMPORT_PREVIEW),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/[^/]+\/projects\/[^/]+\/work-items\/import\/$/,
      resolve: () => clone(mockImportJob(EImportStatus.Completed)),
    },
    {
      method: "GET",
      // Polled by useImportJob until the job leaves a pending state — always
      // resolve Completed so the mock stops the poll immediately.
      pattern: /^\/workspaces\/[^/]+\/projects\/[^/]+\/work-items\/import\/([^/]+)\/$/,
      resolve: () => clone(mockImportJob(EImportStatus.Completed)),
    },
    {
      method: "GET",
      // Polled by useExportJob until the job leaves the pending state —
      // always resolve Ready so the mock stops the poll immediately. The
      // `{id}` capture excludes the literal "template" so it never shadows
      // the `/export/template/` download route.
      pattern: /^\/workspaces\/[^/]+\/projects\/[^/]+\/work-items\/export\/(?!template\/?$)([^/]+)\/$/,
      resolve: () => clone(mockExportJob(EExportStatus.Ready)),
    },
  ];
}
