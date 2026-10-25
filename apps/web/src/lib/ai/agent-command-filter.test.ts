import { describe, expect, it } from "vitest";

import { AGENT_COMMANDS } from "@/constants/agent-commands";
import { filterAgentCommands } from "@/lib/ai/agent-command-filter";

describe("filterAgentCommands", () => {
  it("returns only PM commands when agent_pm selected", () => {
    const result = filterAgentCommands(AGENT_COMMANDS, { agentId: "agent_pm", query: "" });
    expect(result.every((c) => c.agent_ids.includes("agent_pm"))).toBe(true);
    expect(result.some((c) => c.slash === "/break-down-epic")).toBe(true);
  });

  it("filters by query substring", () => {
    const result = filterAgentCommands(AGENT_COMMANDS, {
      agentId: "agent_sm",
      query: "sprint",
    });
    expect(result.some((c) => c.slash.includes("sprint"))).toBe(true);
  });
});
