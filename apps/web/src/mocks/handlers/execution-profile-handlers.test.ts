import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import type {
  IExecutionProfileEnvelope,
  ISkillEventsResponse,
} from "@/types/story/execution-profile";

const BASE = "/workspaces/acme/projects/prj_1/stories/st_ep_1";

describe("execution-profile mock handlers", () => {
  it("404s when nothing has been resolved yet", async () => {
    await expect(
      resolveMock("GET", `${BASE}/execution-profile/stored/`),
    ).rejects.toThrow();
  });

  it("resolves a profile with required + recommended skills and gates", async () => {
    const envelope = await resolveMock<IExecutionProfileEnvelope>(
      "POST",
      `${BASE}/execution-profile/`,
      { agent: "claude-code" },
    );
    expect(envelope.agent).toBe("claude-code");
    expect(envelope.stale).toBe(false);
    expect(envelope.profile.skills.filter((s) => s.mode === "required")).toHaveLength(3);
    expect(envelope.profile.skills.filter((s) => s.mode === "recommended")).toHaveLength(2);
    expect(envelope.profile.gates.length).toBeGreaterThan(0);
    expect(envelope.override_history).toEqual([]);

    const stored = await resolveMock<IExecutionProfileEnvelope>(
      "GET",
      `${BASE}/execution-profile/stored/`,
    );
    expect(stored.agent).toBe("claude-code");
  });

  it("override appends to override_history and applies the mode change", async () => {
    await resolveMock<IExecutionProfileEnvelope>("POST", `${BASE}/execution-profile/`, {});
    const overridden = await resolveMock<IExecutionProfileEnvelope>(
      "POST",
      `${BASE}/execution-profile/override/`,
      {
        changes: [{ skillId: "skill_design-system", mode: "required" }],
        reason: "Design gate is mandatory for this work item.",
      },
    );
    expect(overridden.override_history).toHaveLength(1);
    expect(overridden.override_history[0].reason).toBe(
      "Design gate is mandatory for this work item.",
    );
    const skill = overridden.profile.skills.find((s) => s.skillId === "skill_design-system");
    expect(skill?.mode).toBe("required");
  });

  it("override requires a reason", async () => {
    await resolveMock<IExecutionProfileEnvelope>("POST", `${BASE}/execution-profile/`, {});
    await expect(
      resolveMock("POST", `${BASE}/execution-profile/override/`, {
        changes: [{ skillId: "skill_design-system", mode: "required" }],
        reason: "",
      }),
    ).rejects.toThrow();
  });

  it("returns skill-events across the evidence state model", async () => {
    const response = await resolveMock<ISkillEventsResponse>(
      "GET",
      `${BASE}/runs/run_1/skill-events/`,
    );
    expect(response.events.length).toBeGreaterThan(0);
    const states = new Set(response.events.map((e) => e.state));
    expect(states.has("materialized")).toBe(true);
    expect(states.has("agent_reported_invoked")).toBe(true);
    expect(states.has("gate_verified")).toBe(true);
    expect(response.current_states["skill_test-coverage"]).toBe("gate_verified");
  });
});
