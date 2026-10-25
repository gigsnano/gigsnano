import { describe, it, expect } from "vitest";
import { computeSortOrder, SORT_ORDER_SPACING, groupFieldPatch } from "./sort-order";
import { EStoryStatus, EStoryPriority } from "@/types";

const orders: Record<string, number> = { a: 100, b: 200, c: 300 };
const getOrder = (id: string) => orders[id];

describe("computeSortOrder", () => {
  it("drops at the top: first - spacing", () => {
    expect(computeSortOrder(["a", "b", "c"], 0, getOrder)).toBe(100 - SORT_ORDER_SPACING);
  });

  it("drops at the bottom: last + spacing", () => {
    expect(computeSortOrder(["a", "b", "c"], 3, getOrder)).toBe(300 + SORT_ORDER_SPACING);
  });

  it("drops between two: midpoint", () => {
    expect(computeSortOrder(["a", "b", "c"], 1, getOrder)).toBe((100 + 200) / 2);
  });

  it("empty destination group: spacing", () => {
    expect(computeSortOrder([], 0, getOrder)).toBe(SORT_ORDER_SPACING);
  });
});

describe("groupFieldPatch", () => {
  it("maps status/priority/type groups to their fields", () => {
    expect(groupFieldPatch("status", EStoryStatus.Done)).toEqual({ status: EStoryStatus.Done });
    expect(groupFieldPatch("priority", EStoryPriority.High)).toEqual({ priority: EStoryPriority.High });
    expect(groupFieldPatch("type", "bug")).toEqual({ type: "bug" });
  });

  it("returns no field change for ungrouped", () => {
    expect(groupFieldPatch("none", "all")).toEqual({});
  });

  describe("assignee group", () => {
    it("real user id -> assignee_id (+ ai_agent_id cleared)", () => {
      expect(groupFieldPatch("assignee", "u_1")).toEqual({ assignee_id: "u_1", ai_agent_id: null });
    });

    it("valid roster agent id -> ai_agent_id (+ assignee_id cleared)", () => {
      expect(groupFieldPatch("assignee", "agent_pm")).toEqual({ ai_agent_id: "agent_pm", assignee_id: null });
    });

    it("unassigned -> both cleared", () => {
      expect(groupFieldPatch("assignee", "unassigned")).toEqual({ assignee_id: null, ai_agent_id: null });
    });

    it("invalid agent: workflow key -> reorder only, no field patch", () => {
      expect(groupFieldPatch("assignee", "agent:Product Manager · John")).toEqual({});
    });
  });

  describe("custom SELECT field group", () => {
    it("reorder only -- does not write the custom field value", () => {
      expect(groupFieldPatch("cf:f1", "High")).toEqual({});
    });
  });
});
