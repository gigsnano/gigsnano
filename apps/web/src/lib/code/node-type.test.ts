import { describe, expect, it } from "vitest";

import { cardLabel, kindToNodeType, nodeGlyph, nodeTypeMeta, riskToneClass } from "./node-type";
import type { CodeNodeType } from "@/types/code/intelligence";

describe("kindToNodeType", () => {
  it("maps class/interface kinds to class", () => {
    expect(kindToNodeType("Class")).toBe("class");
    expect(kindToNodeType("Interface")).toBe("class");
  });
  it("maps function/method kinds to function", () => {
    expect(kindToNodeType("Function")).toBe("function");
    expect(kindToNodeType("Method")).toBe("function");
  });
  it("prefers test path over kind", () => {
    expect(kindToNodeType("Function", "tests/test_auth.py")).toBe("test");
    expect(kindToNodeType("Class", "src/auth/auth.spec.ts")).toBe("test");
  });
  it("maps migrations path to table", () => {
    expect(kindToNodeType("File", "migrations/0001_init.py")).toBe("table");
  });
  it("defaults to file", () => {
    expect(kindToNodeType(undefined)).toBe("file");
    expect(kindToNodeType("Weird")).toBe("file");
  });
});

describe("nodeTypeMeta", () => {
  const types: CodeNodeType[] = [
    "repository", "module", "folder", "file", "class", "function",
    "api", "database", "table", "queue", "test", "external",
  ];
  it("covers every type with a shape + icon", () => {
    for (const t of types) {
      const m = nodeTypeMeta(t);
      expect(m.shape).toBeTruthy();
      expect(m.icon).toBeTruthy();
      expect(m.label).toBeTruthy();
    }
  });
  it("does not make everything a circle", () => {
    expect(nodeTypeMeta("api").shape).toBe("box");
    expect(nodeTypeMeta("table").shape).toBe("database");
    expect(nodeTypeMeta("test").shape).toBe("square");
  });
});

describe("riskToneClass", () => {
  it("uses the destructive token for high risk", () => {
    expect(riskToneClass("high")).toBe("text-destructive");
    expect(riskToneClass(undefined)).toBe("text-muted-foreground");
  });
});

describe("nodeGlyph", () => {
  it("returns unicode glyph for each type", () => {
    expect(nodeGlyph("function")).toBe("●");
    expect(nodeGlyph("module")).toBe("▤");
    expect(nodeGlyph("file")).toBe("▢");
  });
});

describe("cardLabel", () => {
  it("builds a 2-line card label", () => {
    expect(cardLabel("auth", "module", 46)).toBe("auth\n▤ Module · 46");
    expect(cardLabel("getName", "function")).toBe("getName\n● Function");
  });
});
