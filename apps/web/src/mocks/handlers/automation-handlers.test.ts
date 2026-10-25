import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import type { IAutomationAst, IAutomationRule, IAutomationRun, IWorkflowRule } from "@/types";

import { compileNl } from "./automation-handlers";

const A = "/workspaces/acme/projects/prj_mba";

describe("NL compiler", () => {
  it("maps a bug+assign+slack request to trigger/conditions/actions/unsupported", () => {
    const ast = compileNl("When a bug is filed, assign the Developer persona and post to Slack");
    expect(ast.trigger).toBe("story.created");
    expect(ast.conditions).toContainEqual({ field: "type", op: "eq", value: "bug" });
    expect(ast.actions.some((a) => a.type === "assign_persona")).toBe(true);
    expect(ast.unsupported.join(" ")).toMatch(/slack/i);
  });

  it("detects a schedule trigger", () => {
    expect(compileNl("every monday create a work item").trigger).toBe("schedule");
  });
});

describe("automation mock flow", () => {
  it("preview → create → dry-run → runs", async () => {
    const preview = await resolveMock<IAutomationAst>("POST", `${A}/automation-rules/preview/`, {
      text: "when a bug is created, assign the developer",
    });
    expect(preview.actions.length).toBeGreaterThan(0);

    const rule = await resolveMock<IAutomationRule>("POST", `${A}/automation-rules/`, {
      name: "Bug router",
      text: "when a bug is created, assign the developer",
    });
    expect(rule.enabled).toBe(true);

    const run = await resolveMock<IAutomationRun>("POST", `${A}/automation-rules/${rule.id}/dry-run/`, {});
    expect(run.dry_run).toBe(true);

    const runs = await resolveMock<IAutomationRun[]>("GET", `${A}/automation-rules/${rule.id}/runs/`);
    expect(runs.length).toBeGreaterThan(0);
  });
});

describe("workflow mock flow", () => {
  it("lists the seeded gate + creates a new one", async () => {
    const list = await resolveMock<IWorkflowRule[]>("GET", `${A}/workflow-rules/`);
    expect(list.length).toBeGreaterThan(0);

    const created = await resolveMock<IWorkflowRule>("POST", `${A}/workflow-rules/`, {
      to_status: "in_review",
      approver_kind: "human",
      approver_ref: "admin",
    });
    expect(created.approver_ref).toBe("admin");
    expect(created.on_concerns).toBe("block");
  });
});
