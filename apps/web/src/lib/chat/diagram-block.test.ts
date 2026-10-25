import { describe, expect, it } from "vitest";
import { parseDiagramBlocks, stripDiagramBlocks } from "./diagram-block";
import { EDiagramKind } from "@/types";

const VALID = [
  "Here's how login works:",
  "",
  "```gigs:diagram",
  JSON.stringify({
    id: "login-flow",
    kind: "flow",
    title: "Login flow",
    nodes: [
      { id: "a", label: "LoginForm", kind: "route" },
      { id: "b", label: "AuthController", kind: "controller", expandable: true },
    ],
    edges: [{ source: "a", target: "b", label: "POST /login" }],
  }),
  "```",
].join("\n");

describe("parseDiagramBlocks", () => {
  it("extracts one valid block with nodes and edges", () => {
    const blocks = parseDiagramBlocks(VALID);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe("login-flow");
    expect(blocks[0].kind).toBe(EDiagramKind.Flow);
    expect(blocks[0].title).toBe("Login flow");
    expect(blocks[0].nodes).toHaveLength(2);
    expect(blocks[0].edges).toEqual([{ source: "a", target: "b", label: "POST /login" }]);
    expect(blocks[0].nodes[1].expandable).toBe(true);
  });

  it("defaults kind to flow when missing or invalid", () => {
    const text =
      '```gigs:diagram\n{"nodes":[{"id":"a","label":"A"}],"edges":[]}\n```';
    expect(parseDiagramBlocks(text)[0].kind).toBe(EDiagramKind.Flow);
  });

  it("assigns a stable fallback id when none is given", () => {
    const text =
      '```gigs:diagram\n{"nodes":[{"id":"a","label":"A"}],"edges":[]}\n```';
    expect(parseDiagramBlocks(text)[0].id).toBe("diagram-0");
  });

  it("drops nodes missing id or label, and skips a block left with no nodes", () => {
    const text =
      '```gigs:diagram\n{"nodes":[{"id":"a"},{"label":"B"}],"edges":[]}\n```';
    expect(parseDiagramBlocks(text)).toEqual([]);
  });

  it("drops edges that reference an unknown node id", () => {
    const text =
      '```gigs:diagram\n{"nodes":[{"id":"a","label":"A"}],"edges":[{"source":"a","target":"ghost"}]}\n```';
    expect(parseDiagramBlocks(text)[0].edges).toEqual([]);
  });

  it("returns [] for invalid JSON inside the block", () => {
    expect(parseDiagramBlocks("```gigs:diagram\n{not json}\n```")).toEqual([]);
  });

  it("returns [] when there is no block", () => {
    expect(parseDiagramBlocks("Just prose, no diagram.")).toEqual([]);
  });
});

describe("stripDiagramBlocks", () => {
  it("removes the block and leaves surrounding prose", () => {
    const stripped = stripDiagramBlocks(VALID);
    expect(stripped).toBe("Here's how login works:");
    expect(stripped).not.toContain("gigs:diagram");
  });

  it("is a no-op when there is no block", () => {
    expect(stripDiagramBlocks("Plain text")).toBe("Plain text");
  });
});
