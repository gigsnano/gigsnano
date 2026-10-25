import { describe, expect, it } from "vitest";
import { visibleCommands, type ICommand } from "./command-registry";

const CMDS: ICommand[] = [
  { id: "a", label: "Always", icon: [] as never, group: "navigate", type: "action" },
  { id: "p", label: "Project only", icon: [] as never, group: "navigate", type: "action", isVisible: (c) => !!c.projectId },
];

describe("visibleCommands", () => {
  it("keeps commands with no predicate", () => {
    const ctx = { base: "/w", workspaceSlug: "w" };
    expect(visibleCommands(CMDS, ctx).map((c) => c.id)).toEqual(["a"]);
  });
  it("shows project-scoped commands only in a project context", () => {
    const ctx = { base: "/w", workspaceSlug: "w", projectId: "p1" };
    expect(visibleCommands(CMDS, ctx).map((c) => c.id)).toEqual(["a", "p"]);
  });
});
