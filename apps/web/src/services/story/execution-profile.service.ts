import type {
  IExecutionProfileEnvelope,
  IOverrideExecutionProfilePayload,
  IResolveExecutionProfilePayload,
  ISkillEventsResponse,
} from "@/types/story/execution-profile";

import { APIService } from "../api.service";

/** Execution Profile (GIN-288): the pinned skills, gates, and policy for a work
 * item's agent run, plus the evidence timeline. Consumes the shipped GIN-287/289
 * backend endpoints. */
class ExecutionProfileService extends APIService {
  getStored(workspaceSlug: string, projectId: string, storyId: string) {
    return this.get<IExecutionProfileEnvelope>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/execution-profile/stored/`,
    );
  }

  resolve(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: IResolveExecutionProfilePayload,
  ) {
    return this.post<IExecutionProfileEnvelope>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/execution-profile/`,
      payload,
    );
  }

  override(
    workspaceSlug: string,
    projectId: string,
    storyId: string,
    payload: IOverrideExecutionProfilePayload,
  ) {
    return this.post<IExecutionProfileEnvelope>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/execution-profile/override/`,
      payload,
    );
  }

  getSkillEvents(workspaceSlug: string, projectId: string, storyId: string, runId: string) {
    return this.get<ISkillEventsResponse>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/stories/${storyId}/runs/${runId}/skill-events/`,
    );
  }
}

export const executionProfileService = new ExecutionProfileService();
