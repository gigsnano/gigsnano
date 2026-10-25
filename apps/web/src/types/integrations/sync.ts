import type { ID, ISODateString } from "@/types/common";

export enum ESyncJobStatus {
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

/** A GitHub doc-sync job. Poll `GET .../sync/{jobId}/` until terminal. */
export interface ISyncJob {
  id: ID;
  project_id: ID;
  status: ESyncJobStatus;
  commit_sha: string | null;
  error: string | null;
  files_changed: number;
  created_at: ISODateString;
}
