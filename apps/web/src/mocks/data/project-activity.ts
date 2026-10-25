import type { IProjectActivity } from "@/types";
import { EProjectActivityType } from "@/types";

/** Activity-feed fixtures per project (Overview → Activity tab), newest first. */
export const projectActivity: IProjectActivity[] = [
  // Mobile Banking App
  {
    id: "act_mba_1",
    project_id: "prj_mba",
    type: EProjectActivityType.Description,
    actor_name: "Ada Lovelace",
    actor_avatar_url: null,
    action: "updated the project description",
    created_at: "2026-06-27T16:12:00Z",
  },
  {
    id: "act_mba_2",
    project_id: "prj_mba",
    type: EProjectActivityType.Cycle,
    actor_name: "Alan Turing",
    actor_avatar_url: null,
    action: "started cycle Sprint 1",
    created_at: "2026-06-24T09:30:00Z",
  },
  {
    id: "act_mba_3",
    project_id: "prj_mba",
    type: EProjectActivityType.Member,
    actor_name: "Grace Hopper",
    actor_avatar_url: null,
    action: "joined the project",
    created_at: "2026-06-20T11:05:00Z",
  },
  {
    id: "act_mba_4",
    project_id: "prj_mba",
    type: EProjectActivityType.Created,
    actor_name: "Ada Lovelace",
    actor_avatar_url: null,
    action: "created the project",
    created_at: "2026-05-04T10:00:00Z",
  },
  // Analytics Dashboard
  {
    id: "act_ad_1",
    project_id: "prj_ad",
    type: EProjectActivityType.Story,
    actor_name: "Alan Turing",
    actor_avatar_url: null,
    action: "completed Define PRD",
    created_at: "2026-06-29T11:45:00Z",
  },
  {
    id: "act_ad_2",
    project_id: "prj_ad",
    type: EProjectActivityType.Created,
    actor_name: "Alan Turing",
    actor_avatar_url: null,
    action: "created the project",
    created_at: "2026-05-20T08:30:00Z",
  },
  // Design System
  {
    id: "act_ds_1",
    project_id: "prj_ds",
    type: EProjectActivityType.Created,
    actor_name: "Ada Lovelace",
    actor_avatar_url: null,
    action: "created the project",
    created_at: "2026-06-15T13:00:00Z",
  },
];
