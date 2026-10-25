import type { ID } from "./common";

/** Whether a membership is active or an outstanding email invite. */
export enum EMemberStatus {
  Active = "active",
  Pending = "pending",
}

/** Lightweight member shape rendered by AvatarGroup (project card, overview). */
export interface IMemberPreview {
  /** The member's user_id. */
  id: ID;
  display_name: string;
  avatar_url: string | null;
}
