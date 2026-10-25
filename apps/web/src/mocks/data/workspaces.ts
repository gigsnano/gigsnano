import type { IWorkspace, IWorkspaceMember } from "@/types";
import { EMemberStatus, EWorkspaceRole } from "@/types";

export const workspaces: IWorkspace[] = [
  {
    id: "ws_acme",
    slug: "acme",
    name: "Acme Inc.",
    logo_url: null,
    member_count: 4,
    project_count: 3,
    github_connected: true,
    github_repo_url: null,
    // A couple of entries so the charts' holiday exclusion has something to do
    // in mock mode rather than only ever seeing weekends.
    holidays: [
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-12-25", name: "Christmas Day" },
    ],
    created_at: "2026-05-01T09:00:00Z",
    updated_at: "2026-06-28T14:30:00Z",
  },
  {
    id: "ws_studio",
    slug: "studio",
    name: "Studio Labs",
    logo_url: null,
    member_count: 2,
    project_count: 0,
    github_connected: false,
    github_repo_url: null,
    holidays: [],
    created_at: "2026-06-01T09:00:00Z",
    updated_at: "2026-06-15T10:00:00Z",
  },
];

/** Fixed so snapshots and relative-time rendering stay deterministic. */
const MEMBER_TS = "2026-06-01T09:00:00Z";

export const workspaceMembers: IWorkspaceMember[] = [
  { id: "wm_1", workspace_slug: "acme", user_id: "u_1", display_name: "Ada Lovelace", email: "ada@acme.test", avatar_url: null, role: EWorkspaceRole.Owner, status: EMemberStatus.Active, created_at: MEMBER_TS },
  { id: "wm_2", workspace_slug: "acme", user_id: "u_2", display_name: "Alan Turing", email: "alan@acme.test", avatar_url: null, role: EWorkspaceRole.Admin, status: EMemberStatus.Active, created_at: MEMBER_TS },
  { id: "wm_3", workspace_slug: "acme", user_id: "u_3", display_name: "Grace Hopper", email: "grace@acme.test", avatar_url: null, role: EWorkspaceRole.Member, status: EMemberStatus.Active, created_at: MEMBER_TS },
  { id: "wm_4", workspace_slug: "acme", user_id: "u_4", display_name: "Katherine Johnson", email: "katherine@acme.test", avatar_url: null, role: EWorkspaceRole.Member, status: EMemberStatus.Active, created_at: MEMBER_TS },
  { id: "wm_5", workspace_slug: "studio", user_id: "u_2", display_name: "Alan Turing", email: "alan@acme.test", avatar_url: null, role: EWorkspaceRole.Owner, status: EMemberStatus.Active, created_at: MEMBER_TS },
  { id: "wm_6", workspace_slug: "studio", user_id: "u_pending_studio", display_name: "Ada Lovelace", email: "ada@acme.test", avatar_url: null, role: EWorkspaceRole.Member, status: EMemberStatus.Pending, created_at: MEMBER_TS },
];
