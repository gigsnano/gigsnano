import type { ID } from "@/types/common";

export type { IBmadAgent } from "@gigsnano/core";

/** A callable specialist in the workspace roster. Mirrors the API's snake_case. */
export interface IAgent {
  id: ID;
  workspace_slug: string;
  project_id: ID | null;
  name: string;
  persona: string;
  domain: string;
  avatar_color: string;
  voice_id: string;
  instructions: string;
  bundles: string[];
  is_builtin: boolean;
  enabled: boolean;
}

export interface ICapabilityBundle {
  key: string;
  label: string;
  description: string;
  tool_count: number;
}

export interface ICreateAgentPayload {
  name: string;
  persona?: string;
  domain?: string;
  avatar_color?: string;
  voice_id?: string;
  instructions?: string;
  bundles?: string[];
  /** Pins the agent to one project instead of the whole workspace. */
  project_id?: ID | null;
}

export type TUpdateAgentPayload = Partial<ICreateAgentPayload> & { enabled?: boolean };
