import type { ID, ISODateString } from "../common";
import type { IProject } from "../project/project";
import type { IAgentResource } from "../story/agent-run";

export interface ITeamspace {
  id: ID;
  workspace_id: ID;
  name: string;
  description: string;
  /** Pinned artifact ids (personas/skills/design systems) forming the roster. */
  pinned_artifacts: string[];
  member_ids: ID[];
  project_ids: ID[];
  created_at: ISODateString;
}

export interface ITeamspaceRollup {
  total: number;
  done: number;
  progress_pct: number;
}

/** A pinned roster artifact, as returned inside the overview. */
export interface IRosterArtifact {
  id: ID;
  name: string;
  kind?: string;
}

export interface ITeamspaceOverview {
  projects: IProject[];
  rollup: ITeamspaceRollup;
  /** assignee_id (or "unassigned") → open work-item count. */
  human_workload: Record<string, number>;
  agent_workload: IAgentResource[];
  pinned_roster: IRosterArtifact[];
}

export interface ICreateTeamspacePayload {
  name: string;
  description?: string;
  pinned_artifacts?: string[];
  member_ids?: ID[];
  project_ids?: ID[];
}

export interface IUpdateTeamspacePayload {
  name?: string;
  description?: string;
  pinned_artifacts?: string[];
}
