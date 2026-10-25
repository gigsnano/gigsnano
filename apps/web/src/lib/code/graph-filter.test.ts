import { describe, expect, it } from "vitest";

import { emptyFilters, filterTypedGraph, hasActiveFilters } from "./graph-filter";
import type { CodeNode, CodeRelation } from "@/types/code/intelligence";

const nodes: CodeNode[] = [
  { id: "api1", type: "api", name: "POST /auth/token", module: "auth" },
  { id: "cls1", type: "class", name: "AuthService", module: "auth", risk: "medium" },
  { id: "tbl1", type: "table", name: "users", module: "auth", risk: "high" },
  { id: "fn1", type: "function", name: "issueToken", module: "auth" },
];
const relations: CodeRelation[] = [
  { id: "r1", source: "api1", target: "cls1", type: "calls" },
  { id: "r2", source: "cls1", target: "tbl1", type: "reads" },
  { id: "r3", source: "fn1", target: "tbl1", type: "writes" },
];

describe("filterTypedGraph", () => {
  it("passes everything through with empty filters", () => {
    const out = filterTypedGraph(nodes, relations, emptyFilters());
    expect(out.nodes).toHaveLength(4);
    expect(out.relations).toHaveLength(3);
  });

  it("keeps only requested node types + incident relations", () => {
    const out = filterTypedGraph(nodes, relations, { ...emptyFilters(), nodeTypes: new Set(["api", "class"]) });
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["api1", "cls1"]);
    // r1 (api1->cls1) survives; r2/r3 touch dropped tbl1/fn1
    expect(out.relations.map((r) => r.id)).toEqual(["r1"]);
  });

  it("hotspots preset keeps only high-risk nodes", () => {
    const out = filterTypedGraph(nodes, relations, { ...emptyFilters(), preset: "hotspots" });
    expect(out.nodes.map((n) => n.id)).toEqual(["tbl1"]);
    expect(out.relations).toHaveLength(0);
  });

  it("query matches name substring", () => {
    const out = filterTypedGraph(nodes, relations, { ...emptyFilters(), query: "auth" });
    expect(out.nodes.map((n) => n.id)).toEqual(["api1", "cls1"]);
  });

  it("relation filter narrows edges by type", () => {
    const out = filterTypedGraph(nodes, relations, { ...emptyFilters(), relations: new Set(["reads"]) });
    expect(out.relations.map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for empty, true when any set", () => {
    expect(hasActiveFilters(emptyFilters())).toBe(false);
    expect(hasActiveFilters({ ...emptyFilters(), query: "x" })).toBe(true);
  });
});
