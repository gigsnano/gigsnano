import type { INotification } from "@/types";
import { ENotificationKind } from "@/types";

/** Mock-only field — stripped before API responses. */
export interface IMockNotification extends INotification {
  receiver_user_id: string;
}

const GRACE = { id: "u_2", display_name: "Grace Hopper", avatar_url: null };
const MBA = { id: "prj_mba", name: "Mobile Banking App" };

export const notifications: IMockNotification[] = [
  {
    id: "ntf_1",
    workspace_slug: "acme",
    receiver_user_id: "u_1",
    kind: ENotificationKind.Sprint,
    title: "Sprint-0 complete",
    body: "Mobile Banking App finished planning — Sprint 1 is ready.",
    href: "/acme/projects/prj_mba/cycles/cyc_mba_s1",
    read: false,
    created_at: "2026-05-16T09:00:00Z",
    actor: null,
    project: MBA,
  },
  {
    id: "ntf_2",
    workspace_slug: "acme",
    receiver_user_id: "u_1",
    kind: ENotificationKind.Assignment,
    title: "Story assigned to you",
    body: "You were assigned “Biometric unlock” in Mobile Banking App.",
    href: "/acme/projects/prj_mba/cycles/cyc_mba_s1",
    read: false,
    created_at: "2026-06-27T10:30:00Z",
    actor: GRACE,
    project: MBA,
  },
  {
    id: "ntf_3",
    workspace_slug: "acme",
    receiver_user_id: "u_1",
    kind: ENotificationKind.Mention,
    title: "Grace mentioned you",
    body: "“@Ada can you review the PRD section on offline sync?”",
    href: "/acme/docs/doc_mba_prd",
    read: true,
    created_at: "2026-06-26T14:15:00Z",
    actor: GRACE,
    project: MBA,
  },
  {
    id: "ntf_4",
    workspace_slug: "acme",
    receiver_user_id: "u_1",
    kind: ENotificationKind.System,
    title: "Welcome to GigsNano",
    body: "Create a project to start your BMAD Sprint-0 planning board.",
    href: "/acme/projects",
    read: true,
    created_at: "2026-05-01T09:00:00Z",
    actor: null,
    project: null,
  },
  {
    id: "ntf_5",
    workspace_slug: "acme",
    receiver_user_id: "u_1",
    kind: ENotificationKind.Review,
    title: "Readiness: concerns",
    body: "Mobile Banking App readiness gate returned concerns.",
    href: "/acme/projects/prj_mba/board",
    read: false,
    created_at: "2026-06-28T11:00:00Z",
    actor: null,
    project: MBA,
  },
  {
    id: "ntf_6",
    workspace_slug: "acme",
    receiver_user_id: "u_1",
    kind: ENotificationKind.Agent,
    title: "Architect finished architecture",
    body: "Architect completed architecture on Mobile Banking App.",
    href: "/acme/projects/prj_mba/board",
    read: false,
    created_at: "2026-06-28T15:30:00Z",
    actor: null,
    project: MBA,
  },
];

export function toWireNotification(notification: IMockNotification): INotification {
  const { receiver_user_id: _receiver, ...wire } = notification;
  return wire;
}
