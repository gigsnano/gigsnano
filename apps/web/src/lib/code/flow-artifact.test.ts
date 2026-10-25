import { describe, it, expect } from "vitest";

import { parseFlowArtifact, looksLikeFlow } from "./flow-artifact";

const authFlow = JSON.stringify({
  id: "auth-flow",
  kind: "flow",
  title: "Authentication Architecture",
  nodes: [
    { id: "browser", label: "Browser", kind: "frontend" },
    { id: "api", label: "API service", kind: "api" },
    { id: "authsvc", label: "Auth backend", kind: "service", summary: "Verifies credentials" },
    { id: "db", label: "Database", kind: "database", fileRefs: [{ path: "src/auth/db.ts", line: 12 }] },
  ],
  edges: [
    { id: "e1", source: "browser", target: "api", kind: "sync" },
    { id: "e2", source: "api", target: "authsvc" },
    { id: "e3", source: "authsvc", target: "db", kind: "data" },
  ],
});

describe("parseFlowArtifact — valid (GIN-314)", () => {
  it("renders the supplied Authentication Architecture payload", () => {
    const r = parseFlowArtifact(authFlow);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.flow.title).toBe("Authentication Architecture");
    expect(r.flow.nodes).toHaveLength(4);
    expect(r.flow.edges).toHaveLength(3);
    expect(r.flow.nodes[3].fileRefs).toEqual([{ path: "src/auth/db.ts", line: 12 }]);
  });

  it("accepts from/to edge aliases and defaults direction to TB", () => {
    const r = parseFlowArtifact(
      JSON.stringify({ kind: "flow", title: "T", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [{ from: "a", to: "b" }] }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.flow.direction).toBe("TB");
      expect(r.flow.edges[0]).toMatchObject({ source: "a", target: "b" });
    }
  });

  it("unwraps the typed artifact-part envelope", () => {
    const r = parseFlowArtifact(
      JSON.stringify({ artifactType: "flow", schemaVersion: "1", payload: { nodes: [{ id: "a", label: "A" }], edges: [] } }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("parseFlowArtifact — never misclassifies ordinary content", () => {
  it("rejects plain JSON, prose, and non-flow objects fast", () => {
    expect(looksLikeFlow('{"a":1}')).toBe(false);
    expect(parseFlowArtifact('{"a":1}').ok).toBe(false);
    expect(parseFlowArtifact("just some prose").ok).toBe(false);
    expect(parseFlowArtifact('{"kind":"chart","nodes":[]}').ok).toBe(false);
  });
});

describe("parseFlowArtifact — malformed payloads fail safely", () => {
  const cases: [string, string][] = [
    ["not json", '{"kind":"flow", nodes:}'],
    ["no nodes", '{"kind":"flow","nodes":[]}'],
    ["duplicate node id", '{"kind":"flow","nodes":[{"id":"a","label":"A"},{"id":"a","label":"B"}]}'],
    ["missing label", '{"kind":"flow","nodes":[{"id":"a"}]}'],
    ["bad schema version", '{"kind":"flow","schemaVersion":"9","nodes":[{"id":"a","label":"A"}]}'],
  ];
  for (const [name, payload] of cases) {
    it(name, () => {
      const r = parseFlowArtifact(payload);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBeTruthy();
    });
  }

  it("drops edges that reference a missing node rather than failing the flow", () => {
    const r = parseFlowArtifact(
      '{"kind":"flow","nodes":[{"id":"a","label":"A"}],"edges":[{"source":"a","target":"ghost"}]}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flow.edges).toHaveLength(0);
  });

  it("drops unsafe file-ref URLs", () => {
    const r = parseFlowArtifact(
      '{"kind":"flow","nodes":[{"id":"a","label":"A","fileRefs":[{"path":"javascript:alert(1)"},{"path":"src/ok.ts"}]}]}',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.flow.nodes[0].fileRefs).toEqual([{ path: "src/ok.ts" }]);
  });
});
