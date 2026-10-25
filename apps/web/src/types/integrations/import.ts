import type { ID, ISODateString, IOffsetPage, IOffsetPageFilters } from "@/types/common";

export enum EImportStatus {
  Queued = "queued",
  Parsing = "parsing",
  Importing = "importing",
  Completed = "completed",
  CompletedWithErrors = "completed_with_errors",
  Failed = "failed",
}

export interface IImportJobSummary {
  // Plane importer counts
  projects_created?: number;
  stories_created?: number;
  stories_updated?: number;
  cycles_created?: number;
  modules_created?: number;
  labels_created?: number;
  states_created?: number;
  skipped_drafts?: number;
  unmatched_members?: string[];
  errors?: { row: string | number; reason: string }[];
  // GitHub-issues importer counts (GIN-23b)
  issues_created?: number;
  issues_skipped?: number;
  unassigned_logins?: string[];
  notes?: string[];
  // Work-item Excel importer (GIN-75)
  created?: number;
  updated?: number;
  skipped?: number;
  rows_total?: number;
  unmatched_assignees?: string[];
  unknown_labels?: string[];
}

export interface IImportJob {
  id: ID;
  workspace_slug: string;
  source_format: "csv" | "json" | "xlsx" | "github";
  status: EImportStatus;
  summary: IImportJobSummary | null;
  created_at: ISODateString;
}

/** Multipart create — the service method takes a `File` + format, not a JSON body. */
export interface ICreateImportPayload {
  file: File;
  format: "csv" | "json" | "xlsx";
}

/** GitHub-issues import is a JSON body (owner/repo/project), not a file upload. */
export interface ICreateGitHubImportPayload {
  owner: string;
  repo: string;
  project_id: string;
}

export interface IGitHubImportPreview {
  issue_count: number;
  label_count: number;
  assignee_count: number;
}

export type IImportJobPage = IOffsetPage<IImportJob>;

export type IImportFilters = IOffsetPageFilters;
