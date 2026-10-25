import { APIError } from "@/services/api-error";
import type {
  EAgentTarget,
  ESkillEventState,
  IExecutionProfileEnvelope,
  IOverrideExecutionProfilePayload,
  IResolveExecutionProfilePayload,
} from "@/types/story/execution-profile";

import {
  defaultExecutionProfileData,
  EXECUTION_PROFILE_SKILL_EVENTS,
  executionProfileKey,
  executionProfiles,
} from "../data/execution-profile";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

const notFound = (): never => {
  throw new APIError(404, "Execution profile not found");
};

export function makeExecutionProfileHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/execution-profile\/stored\/$/,
      resolve: ([, slug, projectId, storyId]) => {
        const stored = executionProfiles.get(executionProfileKey(slug, projectId, storyId));
        if (!stored) return notFound();
        return clone(stored);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/execution-profile\/$/,
      resolve: ([, slug, projectId, storyId], body) => {
        const key = executionProfileKey(slug, projectId, storyId);
        const existing = executionProfiles.get(key);
        const b = (body ?? {}) as IResolveExecutionProfilePayload;
        const envelope: IExecutionProfileEnvelope = {
          story_id: storyId,
          agent: b.agent ?? existing?.agent ?? ("auto" as EAgentTarget),
          policy: (b.policy as IExecutionProfileEnvelope["policy"]) ?? existing?.policy ?? "suggest",
          stale: false,
          profile: defaultExecutionProfileData(),
          override_history: existing?.override_history ?? [],
        };
        envelope.profile.policy = envelope.policy;
        executionProfiles.set(key, envelope);
        return clone(envelope);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/execution-profile\/override\/$/,
      resolve: ([, slug, projectId, storyId], body) => {
        const key = executionProfileKey(slug, projectId, storyId);
        const envelope = executionProfiles.get(key);
        if (!envelope) return notFound();
        if (envelope.policy === "locked") {
          throw new APIError(403, "Locked requirements cannot be overridden");
        }
        const b = body as IOverrideExecutionProfilePayload;
        if (!b.reason?.trim()) throw new APIError(400, "A reason is required");
        for (const change of b.changes) {
          if (change.mode === "removed") {
            envelope.profile.skills = envelope.profile.skills.filter(
              (s) => s.skillId !== change.skillId,
            );
            continue;
          }
          const skill = envelope.profile.skills.find((s) => s.skillId === change.skillId);
          if (skill) skill.mode = change.mode;
        }
        envelope.override_history.push({ reason: b.reason.trim(), changes: b.changes });
        executionProfiles.set(key, envelope);
        return clone(envelope);
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/stories\/([^/]+)\/runs\/([^/]+)\/skill-events\/$/,
      resolve: () => {
        const events = clone(EXECUTION_PROFILE_SKILL_EVENTS);
        const currentStates: Record<string, ESkillEventState> = {};
        for (const event of events) currentStates[event.skill_id] = event.state;
        return { events, current_states: currentStates };
      },
    },
  ];
}
