import type { ESkillEventState, ESkillMode, IExecutionProfileSkill } from "@/types/story/execution-profile";

/** Group a profile's skills by mode, preserving each group's original order
 * (the resolver's `order` field already reflects execution sequence). */
export function groupSkills(skills: IExecutionProfileSkill[]): Record<ESkillMode, IExecutionProfileSkill[]> {
  const groups: Record<ESkillMode, IExecutionProfileSkill[]> = {
    required: [],
    recommended: [],
    prohibited: [],
  };
  for (const skill of skills) {
    groups[skill.mode].push(skill);
  }
  return groups;
}

/** Human label for an evidence-timeline event state. Deliberately distinguishes
 * "delivered" from "reported invoked"/"verified" — the UI must never imply a
 * planned/selected skill actually ran. */
const EVIDENCE_LABELS: Record<ESkillEventState, string> = {
  selected: "Selected",
  resolved: "Resolved",
  downloaded: "Downloaded",
  digest_verified: "Digest verified",
  materialized: "Delivered",
  agent_acknowledged: "Acknowledged",
  agent_reported_invoked: "Reported invoked",
  gate_verified: "Verified",
  failed: "Failed",
  skipped: "Skipped",
  revoked: "Revoked",
};

export function evidenceLabel(state: ESkillEventState): string {
  return EVIDENCE_LABELS[state];
}
