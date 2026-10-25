import { describe, expect, it } from "vitest";

import {
  contentLines,
  languageFromPath,
  shikiLanguageFromPath,
  workspacePreviewKind,
} from "./file-preview";

describe("workspacePreviewKind", () => {
  it("detects markdown", () => {
    expect(workspacePreviewKind("docs/prd.md")).toBe("markdown");
  });

  it("detects code extensions", () => {
    expect(workspacePreviewKind("src/app.tsx")).toBe("code");
    expect(workspacePreviewKind("package.json")).toBe("code");
  });

  it("marks unknown binary as unsupported", () => {
    expect(workspacePreviewKind("assets/logo.png")).toBe("unsupported");
  });
});

describe("languageFromPath", () => {
  it("returns a readable label", () => {
    expect(languageFromPath("src/index.ts")).toBe("TypeScript");
  });
});

describe("shikiLanguageFromPath", () => {
  it("maps extensions to shiki grammar ids", () => {
    expect(shikiLanguageFromPath("src/index.ts")).toBe("typescript");
    expect(shikiLanguageFromPath("Dockerfile")).toBe("dockerfile");
  });

  it("returns null for unsupported grammars", () => {
    expect(shikiLanguageFromPath(".gitignore")).toBeNull();
  });
});

describe("contentLines", () => {
  it("normalizes CRLF and preserves trailing empty line", () => {
    expect(contentLines("a\r\nb\n")).toEqual(["a", "b", ""]);
  });
});
