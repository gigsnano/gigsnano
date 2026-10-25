import type { IProjectMember } from "@/types";
import { EMemberStatus, EProjectRole } from "@/types";

export const projectMembers: IProjectMember[] = [
  // Mobile Banking App (prj_mba) — 4 members
  { id: "pm_1", project_id: "prj_mba", user_id: "u_1", display_name: "Ada Lovelace", email: "ada@acme.test", avatar_url: null, role: EProjectRole.Admin, status: EMemberStatus.Active },
  { id: "pm_2", project_id: "prj_mba", user_id: "u_2", display_name: "Alan Turing", email: "alan@acme.test", avatar_url: null, role: EProjectRole.Member, status: EMemberStatus.Active },
  { id: "pm_3", project_id: "prj_mba", user_id: "u_3", display_name: "Grace Hopper", email: "grace@acme.test", avatar_url: null, role: EProjectRole.Member, status: EMemberStatus.Active },
  { id: "pm_4", project_id: "prj_mba", user_id: "u_4", display_name: "Katherine Johnson", email: "katherine@acme.test", avatar_url: null, role: EProjectRole.Viewer, status: EMemberStatus.Active },
  // Analytics Dashboard (prj_ad) — 3 members
  { id: "pm_5", project_id: "prj_ad", user_id: "u_2", display_name: "Alan Turing", email: "alan@acme.test", avatar_url: null, role: EProjectRole.Admin, status: EMemberStatus.Active },
  { id: "pm_6", project_id: "prj_ad", user_id: "u_3", display_name: "Grace Hopper", email: "grace@acme.test", avatar_url: null, role: EProjectRole.Member, status: EMemberStatus.Active },
  { id: "pm_7", project_id: "prj_ad", user_id: "u_5", display_name: "Linus Torvalds", email: "linus@acme.test", avatar_url: null, role: EProjectRole.Member, status: EMemberStatus.Active },
  // Design System (prj_ds) — 2 members (matches its card preview)
  { id: "pm_8", project_id: "prj_ds", user_id: "u_1", display_name: "Ada Lovelace", email: "ada@acme.test", avatar_url: null, role: EProjectRole.Admin, status: EMemberStatus.Active },
  { id: "pm_9", project_id: "prj_ds", user_id: "u_2", display_name: "Alan Turing", email: "alan@acme.test", avatar_url: null, role: EProjectRole.Member, status: EMemberStatus.Active },
];
