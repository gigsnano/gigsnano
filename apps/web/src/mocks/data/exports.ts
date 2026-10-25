import type { IExportJob } from "@/types";
import { EExportStatus } from "@/types";

const TS = "2026-06-15T10:00:00Z";
const EXPORT_TTL_DAYS = 7;

function expiresAt(createdAt: string): string {
  const d = new Date(createdAt);
  d.setUTCDate(d.getUTCDate() + EXPORT_TTL_DAYS);
  return d.toISOString();
}

export const exportJobs: IExportJob[] = [
  {
    id: "exp_1",
    workspace_slug: "acme",
    name: "Projects snapshot",
    format: "csv",
    status: EExportStatus.Ready,
    download_url: "#mock-export-projects.csv",
    expires_at: expiresAt(TS),
    created_at: TS,
  },
  {
    id: "exp_2",
    workspace_slug: "acme",
    name: "Members roster",
    format: "json",
    status: EExportStatus.Ready,
    download_url: "#mock-export-members.json",
    expires_at: expiresAt("2026-06-01T10:00:00Z"),
    created_at: "2026-06-01T10:00:00Z",
  },
];
