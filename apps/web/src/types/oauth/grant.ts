import type { ISODateString } from "@/types/common";

/** OAuth app authorized for hosted MCP access. User-scoped — no workspaceSlug. */
export interface IOAuthGrant {
  client_id: string;
  client_name: string;
  authorized_at: ISODateString;
  scope: string;
}
