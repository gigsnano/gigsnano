import type { IWorkspaceInvitation } from "@/types";
import { EInvitationStatus, EWorkspaceRole } from "@/types";

const TS = "2026-06-18T09:00:00Z";

export const workspaceInvitations: IWorkspaceInvitation[] = [
  {
    id: "inv_1",
    workspace_slug: "acme",
    email: "jordan@example.com",
    role: EWorkspaceRole.Member,
    invited_by_name: "Ada Lovelace",
    created_at: TS,
    status: EInvitationStatus.Pending,
    expires_at: "2026-06-25T09:00:00Z",
    last_sent_at: TS,
    accepted_at: null,
    resend_count: 0,
    project_grants: [],
  },
  {
    id: "inv_2",
    workspace_slug: "acme",
    email: "casey@startup.io",
    role: EWorkspaceRole.Admin,
    invited_by_name: "Alan Turing",
    created_at: "2026-06-10T14:00:00Z",
    // Deliberately settled, so the Invitations screen has history to render and
    // the members list has something it must NOT show.
    status: EInvitationStatus.Accepted,
    expires_at: "2026-06-17T14:00:00Z",
    last_sent_at: "2026-06-10T14:00:00Z",
    accepted_at: "2026-06-11T08:30:00Z",
    resend_count: 1,
    project_grants: [],
  },
];
