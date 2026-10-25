import { describe, expect, it } from "vitest";

import { EStoryRelationType, type IProjectRelation, type IStory } from "@/types";

import { buildDependencyGraph } from "./dependency-graph";

function story(id: string, parent_id: string | null = null): IStory {
  return { id, parent_id, title: id } as unknown as IStory;
}

function rel(
  story_id: string,
  related_story_id: string,
  relation_type = EStoryRelationType.Blocks,
): IProjectRelation {
  return { story_id, related_story_id, relation_type };
}

describe("buildDependencyGraph", () => {
  it("builds containment edges from parent_id", () => {
    const g = buildDependencyGraph([story("epic"), story("a", "epic"), story("b", "epic")]);
    expect(g.edges.filter((e) => e.kind === "parent").map((e) => `${e.source}->${e.target}`)).toEqual(
      ["epic->a", "epic->b"],
    );
  });

  it("assigns depth by walking up the parent chain", () => {
    const g = buildDependencyGraph([story("epic"), story("a", "epic"), story("sub", "a")]);
    expect(Object.fromEntries(g.nodes.map((n) => [n.id, n.depth]))).toEqual({
      epic: 0,
      a: 1,
      sub: 2,
    });
  });

  it("drops items that have no dependencies at all, and counts them", () => {
    // Most of a real backlog is unconnected; drawing it buries the structure.
    const g = buildDependencyGraph([story("epic"), story("a", "epic"), story("loner")]);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["a", "epic"]);
    expect(g.isolatedCount).toBe(1);
  });

  it("hides everything when nothing is connected — zero relations, no hierarchy", () => {
    // Today story_relations is empty, so a flat backlog graphs to nothing. That must
    // be an honest empty state, not a column of disconnected cards.
    const g = buildDependencyGraph([story("a"), story("b")], []);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.isolatedCount).toBe(2);
  });

  it("normalises blocked_by into the same direction as blocking", () => {
    // "B blocked_by A" is the same edge as "A blocks B".
    const g = buildDependencyGraph(
      [story("a"), story("b")],
      [rel("b", "a", EStoryRelationType.BlockedBy)],
    );
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ source: "a", target: "b", kind: EStoryRelationType.Blocks });
  });

  it("collapses a mirrored pair into one edge", () => {
    const g = buildDependencyGraph(
      [story("a"), story("b")],
      [rel("a", "b", EStoryRelationType.Blocks), rel("b", "a", EStoryRelationType.BlockedBy)],
    );
    expect(g.edges).toHaveLength(1);
  });

  it("drops edges pointing at stories outside the filtered set", () => {
    // The caller passes filtered stories; an edge to a hidden one would be an arrow
    // into nothing.
    const g = buildDependencyGraph([story("a")], [rel("a", "ghost")]);
    expect(g.edges).toEqual([]);
    // ...and "a" is then isolated, so it is not drawn either.
    expect(g.nodes).toEqual([]);
    expect(g.isolatedCount).toBe(1);
  });

  it("ignores a parent_id that isn't in the set", () => {
    const g = buildDependencyGraph([story("a", "missing-epic")]);
    expect(g.edges).toEqual([]);
    expect(g.nodes).toEqual([]);
  });

  it("flags every node in a blocking cycle", () => {
    const g = buildDependencyGraph(
      [story("a"), story("b"), story("c")],
      [rel("a", "b"), rel("b", "c"), rel("c", "a")],
    );
    expect([...g.cycleNodeIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("does not flag a diamond — shared dependencies are not cycles", () => {
    const g = buildDependencyGraph(
      [story("a"), story("b"), story("c"), story("d")],
      [rel("a", "b"), rel("a", "c"), rel("b", "d"), rel("c", "d")],
    );
    expect(g.cycleNodeIds.size).toBe(0);
  });

  it("does not treat a relates_to loop as a cycle", () => {
    // relates_to is an annotation, not ordering — a loop of it means nothing.
    const g = buildDependencyGraph(
      [story("a"), story("b")],
      [
        rel("a", "b", EStoryRelationType.RelatesTo),
        rel("b", "a", EStoryRelationType.RelatesTo),
      ],
    );
    expect(g.cycleNodeIds.size).toBe(0);
  });

  it("survives a corrupt parent cycle without hanging", () => {
    const g = buildDependencyGraph([story("a", "b"), story("b", "a")]);
    expect(g.nodes).toHaveLength(2);
    expect(g.isolatedCount).toBe(0);
  });
});
