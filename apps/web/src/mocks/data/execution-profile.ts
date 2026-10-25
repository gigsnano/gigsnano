import type {
  IExecutionProfileData,
  IExecutionProfileEnvelope,
  IExecutionProfileSkill,
  ISkillEvent,
} from "@/types/story/execution-profile";

/**
 * Fixtures for the Execution Profile (GIN-288). Mirrors the shipped GIN-287/289
 * backend shapes: 3 core `required` pinned skills + 2 `design` `recommended`
 * skills, a gate list in execution order, and an evidence timeline that spans
 * the full skill-event state model (never conflating "planned" with "ran").
 */

export const EXECUTION_PROFILE_SKILLS: IExecutionProfileSkill[] = [
  {
    skillId: "skill_test-coverage",
    version: "2.1.0",
    digest: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    mode: "required",
    order: 0,
    source: "core",
    status: "pinned",
  },
  {
    skillId: "skill_type-safety",
    version: "1.4.2",
    digest: "sha256:2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
    mode: "required",
    order: 1,
    source: "core",
    status: "pinned",
  },
  {
    skillId: "skill_security-review",
    version: "3.0.1",
    digest: "sha256:3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
    mode: "required",
    order: 2,
    source: "core",
    status: "pinned",
  },
  {
    skillId: "skill_design-system",
    version: "1.9.0",
    digest: "sha256:4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
    mode: "recommended",
    order: 3,
    source: "design",
    status: "pinned",
  },
  {
    skillId: "skill_accessibility",
    version: null,
    digest: null,
    mode: "recommended",
    order: 4,
    source: "design",
    status: "unavailable",
    reason: "No pinned version compatible with the resolved registry snapshot.",
  },
];

export const EXECUTION_PROFILE_GATES: string[] = [
  "test-coverage-gate",
  "type-check-gate",
  "design-system-check",
  "accessibility-audit",
];

/** Build a fresh resolved profile body (as `resolve()` would return it). */
export function defaultExecutionProfileData(): IExecutionProfileData {
  return {
    classification: {
      work_type: "ui_feature",
      domains: ["frontend", "design"],
      signals: ["story touches components/", "title mentions UI"],
    },
    skills: structuredClone(EXECUTION_PROFILE_SKILLS),
    gates: [...EXECUTION_PROFILE_GATES],
    policy: "suggest",
    confidence: "high",
    citations: [
      { type: "registry", ref: "skills/core/test-coverage.md" },
      { type: "registry", ref: "skills/design/design-system.md" },
    ],
  };
}

/** In-memory store of resolved envelopes, keyed by `${slug}:${projectId}:${storyId}`.
 * Empty until `resolve()` is called — GET stored/ 404s until then, matching the
 * real backend ("404 if none persisted"). */
export const executionProfiles = new Map<string, IExecutionProfileEnvelope>();

export function executionProfileKey(slug: string, projectId: string, storyId: string) {
  return `${slug}:${projectId}:${storyId}`;
}

/** Evidence timeline across the full skill-event state model. `materialized`
 * ("Delivered") is deliberately distinct from `agent_reported_invoked` and
 * `gate_verified` so the UI never implies a planned skill ran. */
export const EXECUTION_PROFILE_SKILL_EVENTS: ISkillEvent[] = [
  { id: "evt_1", skill_id: "skill_test-coverage", state: "selected", version: "2.1.0", digest: null, agent: null, gate: null, evidence: [], reason: null },
  { id: "evt_2", skill_id: "skill_test-coverage", state: "resolved", version: "2.1.0", digest: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", agent: null, gate: null, evidence: [], reason: null },
  { id: "evt_3", skill_id: "skill_test-coverage", state: "downloaded", version: "2.1.0", digest: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", agent: "claude-code", gate: null, evidence: [], reason: null },
  { id: "evt_4", skill_id: "skill_test-coverage", state: "digest_verified", version: "2.1.0", digest: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", agent: "claude-code", gate: null, evidence: [], reason: null },
  { id: "evt_5", skill_id: "skill_test-coverage", state: "materialized", version: "2.1.0", digest: "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b", agent: "claude-code", gate: null, evidence: [{ path: ".claude/skills/test-coverage/SKILL.md" }], reason: null },
  { id: "evt_6", skill_id: "skill_test-coverage", state: "agent_acknowledged", version: "2.1.0", digest: null, agent: "claude-code", gate: null, evidence: [], reason: null },
  { id: "evt_7", skill_id: "skill_test-coverage", state: "agent_reported_invoked", version: "2.1.0", digest: null, agent: "claude-code", gate: null, evidence: [{ tool_call: "run_tests" }], reason: null },
  { id: "evt_8", skill_id: "skill_test-coverage", state: "gate_verified", version: "2.1.0", digest: null, agent: "claude-code", gate: "test-coverage-gate", evidence: [{ coverage_pct: 92 }], reason: null },

  { id: "evt_9", skill_id: "skill_type-safety", state: "selected", version: "1.4.2", digest: null, agent: null, gate: null, evidence: [], reason: null },
  { id: "evt_10", skill_id: "skill_type-safety", state: "resolved", version: "1.4.2", digest: "sha256:2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c", agent: null, gate: null, evidence: [], reason: null },
  { id: "evt_11", skill_id: "skill_type-safety", state: "failed", version: "1.4.2", digest: null, agent: "claude-code", gate: "type-check-gate", evidence: [], reason: "Registry fetch timed out after 3 retries." },

  { id: "evt_12", skill_id: "skill_security-review", state: "selected", version: "3.0.1", digest: null, agent: null, gate: null, evidence: [], reason: null },
  { id: "evt_13", skill_id: "skill_security-review", state: "resolved", version: "3.0.1", digest: "sha256:3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d", agent: null, gate: null, evidence: [], reason: null },
  { id: "evt_14", skill_id: "skill_security-review", state: "revoked", version: "3.0.1", digest: null, agent: null, gate: null, evidence: [], reason: "Superseded by an override that removed this skill." },

  { id: "evt_15", skill_id: "skill_design-system", state: "selected", version: "1.9.0", digest: null, agent: null, gate: null, evidence: [], reason: null },
  { id: "evt_16", skill_id: "skill_design-system", state: "skipped", version: "1.9.0", digest: null, agent: null, gate: null, evidence: [], reason: "Recommended skill not required for this run." },
];
