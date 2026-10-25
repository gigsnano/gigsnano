import type { ID, ISODateString, IOffsetPage, IOffsetPageFilters } from "@/types/common";

export enum EExportStatus {
  Pending = "pending",
  Ready = "ready",
  Failed = "failed",
}

export interface IExportJob {
  id: ID;
  workspace_slug: string;
  name: string;
  format: "csv" | "json" | "xlsx";
  status: EExportStatus;
  download_url: string | null;
  expires_at: ISODateString | null;
  created_at: ISODateString;
}

export interface ICreateExportPayload {
  name: string;
  format: "csv" | "json" | "xlsx";
}

export type IExportJobPage = IOffsetPage<IExportJob>;

export type IExportFilters = IOffsetPageFilters;
