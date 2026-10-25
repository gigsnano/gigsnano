import { describe, expect, it } from "vitest";

import {
  normalizeGigsql,
  parseGigsql,
  type IGigsQLBetween,
  type IGigsQLIn,
  type IGigsQLIsNull,
  type IGigsQLLogical,
  type IGigsQLPredicate,
} from "./gigsql";

describe("parseGigsql", () => {
  it("parses priority and status in", () => {
    const parsed = parseGigsql("priority = high AND status in (todo, in_progress)");
    expect(parsed.kind).toBe("ok");
    if (parsed.kind !== "ok") return;

    const node = parsed.node as IGigsQLLogical;
    expect(node.kind).toBe("logical");
    expect(node.operator).toBe("AND");
    expect(node.children).toHaveLength(2);

    const [left, right] = node.children;
    expect(left).toEqual({
      kind: "predicate",
      field: "priority",
      operator: "=",
      value: "high",
      domain: "work_item",
    });
    expect(right).toEqual({
      kind: "in",
      field: "status",
      values: ["todo", "in_progress"],
      negated: false,
      domain: "work_item",
    });
  });

  it("parses assignee or is null", () => {
    const parsed = parseGigsql("assignee = me OR assignee is null");
    expect(parsed.kind).toBe("ok");
    if (parsed.kind !== "ok") return;

    const node = parsed.node as IGigsQLLogical;
    expect(node.operator).toBe("OR");
    expect(node.children[0]).toEqual({
      kind: "predicate",
      field: "assignee",
      operator: "=",
      value: "me",
      domain: "work_item",
    });
    expect(node.children[1]).toEqual({
      kind: "is_null",
      field: "assignee",
      domain: "work_item",
    } satisfies IGigsQLIsNull);
  });

  it("parses grouped title and due date", () => {
    const parsed = parseGigsql("(title ~ login) AND dueDate >= 2026-07-01");
    expect(parsed.kind).toBe("ok");
    if (parsed.kind !== "ok") return;

    const node = parsed.node as IGigsQLLogical;
    expect(node.operator).toBe("AND");
    expect(node.children[0]).toEqual({
      kind: "predicate",
      field: "title",
      operator: "~",
      value: "login",
      domain: "work_item",
    });
    expect(node.children[1]).toEqual({
      kind: "predicate",
      field: "dueDate",
      operator: ">=",
      value: "2026-07-01",
      domain: "work_item",
    });
  });

  it("parses code-analysis field with domain metadata", () => {
    const parsed = parseGigsql("severity = high");
    expect(parsed.kind).toBe("ok");
    if (parsed.kind !== "ok") return;

    expect(parsed.node).toEqual({
      kind: "predicate",
      field: "severity",
      operator: "=",
      value: "high",
      domain: "code_analysis",
    } satisfies IGigsQLPredicate);
  });

  it("returns error for invalid operator on field", () => {
    const parsed = parseGigsql("title in (login)");
    expect(parsed.kind).toBe("error");
    if (parsed.kind === "error") {
      expect(parsed.reason).toMatch(/title/i);
    }
  });

  it("returns error for invalid type", () => {
    expect(parseGigsql("type = chore").kind).toBe("error");
    expect(parseGigsql("type:chore").kind).toBe("error");
  });

  it("returns empty for blank input", () => {
    expect(parseGigsql("")).toEqual({ kind: "empty" });
    expect(parseGigsql("   ")).toEqual({ kind: "empty" });
  });
});

describe("normalizeGigsql", () => {
  it("rewrites colon shorthand to canonical syntax", () => {
    expect(normalizeGigsql("status:todo priority:high")).toEqual({
      kind: "ok",
      query: "status = todo AND priority = high",
    });
  });

  it("rewrites repeated same-field colon terms to in", () => {
    expect(normalizeGigsql("status:todo status:in_progress")).toEqual({
      kind: "ok",
      query: "status in (todo, in_progress)",
    });
    expect(normalizeGigsql("status:todo status:in_progress priority:high assignee:me")).toEqual({
      kind: "ok",
      query: "status in (todo, in_progress) AND priority = high AND assignee = me",
    });
    expect(normalizeGigsql("cycle:c1 cycle:c2 module:m1 type:story")).toEqual({
      kind: "ok",
      query: "cycle in (c1, c2) AND module = m1 AND type = story",
    });
  });

  it("rewrites colon date range and title", () => {
    expect(normalizeGigsql("due:2026-07-01..2026-07-31")).toEqual({
      kind: "ok",
      query: "dueDate between 2026-07-01 and 2026-07-31",
    });
    expect(normalizeGigsql("title:login")).toEqual({
      kind: "ok",
      query: "title ~ login",
    });
  });

  it("rejects code-analysis fields for work-item normalization", () => {
    expect(normalizeGigsql("severity = high").kind).toBe("error");
    expect(normalizeGigsql("severity:high").kind).toBe("error");
  });

  it("round-trips canonical input", () => {
    const query = "priority = high AND status in (todo, in_progress)";
    expect(normalizeGigsql(query)).toEqual({ kind: "ok", query });
  });

  it("returns empty for blank input", () => {
    expect(normalizeGigsql("")).toEqual({ kind: "empty" });
    expect(normalizeGigsql(null)).toEqual({ kind: "empty" });
    expect(normalizeGigsql("   ")).toEqual({ kind: "empty" });
  });
});
