import { describe, it, expect } from "vitest";

import { evidenceLabel, groupSkills } from "./execution-profile";
import type { IExecutionProfileSkill } from "@/types/story/execution-profile";

function makeSkill(overrides: Partial<IExecutionProfileSkill>): IExecutionProfileSkill {
  return {
    skillId: "skill_1",
    version: "1.0.0",
    digest: "sha256:abc",
    mode: "required",
    order: 0,
    source: "registry",
    status: "pinned",
    ...overrides,
  };
}

describe("groupSkills", () => {
  it("buckets skills by mode, preserving order within each group", () => {
    const skills = [
      makeSkill({ skillId: "a", mode: "required", order: 0 }),
      makeSkill({ skillId: "b", mode: "recommended", order: 1 }),
      makeSkill({ skillId: "c", mode: "required", order: 2 }),
      makeSkill({ skillId: "d", mode: "prohibited", order: 3 }),
    ];
    const groups = groupSkills(skills);
    expect(groups.required.map((s) => s.skillId)).toEqual(["a", "c"]);
    expect(groups.recommended.map((s) => s.skillId)).toEqual(["b"]);
    expect(groups.prohibited.map((s) => s.skillId)).toEqual(["d"]);
  });

  it("returns empty arrays for modes with no skills", () => {
    const groups = groupSkills([]);
    expect(groups).toEqual({ required: [], recommended: [], prohibited: [] });
  });
});

describe("evidenceLabel", () => {
  it("labels materialized as Delivered, not a generic run label", () => {
    expect(evidenceLabel("materialized")).toBe("Delivered");
  });

  it("distinguishes acknowledged, reported-invoked, and verified", () => {
    expect(evidenceLabel("agent_acknowledged")).toBe("Acknowledged");
    expect(evidenceLabel("agent_reported_invoked")).toBe("Reported invoked");
    expect(evidenceLabel("gate_verified")).toBe("Verified");
  });

  it("labels failed", () => {
    expect(evidenceLabel("failed")).toBe("Failed");
  });
});
