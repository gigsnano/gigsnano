import { describe, expect, it } from "vitest";

import { groupAgentsByDomain } from "./agent-grouping";
import type { IAgent } from "@/types/ai/agent";

const agent = (over: Partial<IAgent>): IAgent => ({
  id: "1", workspace_slug: "acme", project_id: null, name: "A", persona: "",
  domain: "software", avatar_color: "#000000", voice_id: "", instructions: "",
  bundles: [], is_builtin: false, enabled: true, ...over,
});

describe("groupAgentsByDomain", () => {
  it("groups by domain and sorts groups alphabetically", () => {
    const groups = groupAgentsByDomain(
      [agent({ id: "1", domain: "software" }), agent({ id: "2", domain: "finance" })],
      "",
    );
    expect(groups.map((g) => g.domain)).toEqual(["finance", "software"]);
  });

  it("filters on name and persona, case-insensitively", () => {
    const agents = [
      agent({ id: "1", name: "Product Manager", persona: "John" }),
      agent({ id: "2", name: "Finance", persona: "Ravi" }),
    ];
    expect(groupAgentsByDomain(agents, "ravi").flatMap((g) => g.agents).map((a) => a.id))
      .toEqual(["2"]);
    expect(groupAgentsByDomain(agents, "MANAGER").flatMap((g) => g.agents).map((a) => a.id))
      .toEqual(["1"]);
  });

  it("drops disabled agents — you cannot call someone who is off", () => {
    expect(groupAgentsByDomain([agent({ enabled: false })], "")).toEqual([]);
  });

  it("returns no empty groups when a filter excludes a whole domain", () => {
    const groups = groupAgentsByDomain(
      [agent({ id: "1", domain: "finance", name: "Finance" }),
       agent({ id: "2", domain: "software", name: "Dev" })],
      "finance",
    );
    expect(groups).toHaveLength(1);
  });
});
