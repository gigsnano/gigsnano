import type { ID, ISODateString } from "@/types/common";

/** Kind of change recorded in the project activity feed (drives the icon). */
export enum EProjectActivityType {
  Created = "created",
  Updated = "updated",
  Description = "description",
  Member = "member",
  Cycle = "cycle",
  Story = "story",
  Comment = "comment",
}

/** A single entry in a project's activity log (Overview → Activity tab). */
export interface IProjectActivity {
  id: ID;
  project_id: ID;
  type: EProjectActivityType;
  /** Display name of the actor who performed the action. */
  actor_name: string;
  actor_avatar_url: string | null;
  /** Human-readable action, e.g. "updated the project description". */
  action: string;
  created_at: ISODateString;
}
