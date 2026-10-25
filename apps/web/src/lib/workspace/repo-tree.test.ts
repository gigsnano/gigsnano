import { describe, expect, it } from "vitest";

import type { IWorkspaceEntry } from "@/types";

import { buildRepoTree, collectFolderPaths, firstFilePath } from "./repo-tree";

const entries: IWorkspaceEntry[] = [
  { path: "src/index.ts", is_dir: false, size: 100 },
  { path: "src", is_dir: true, size: null },
  { path: "README.md", is_dir: false, size: 50 },
  { path: "docs/prd.md", is_dir: false, size: 200 },
  { path: "docs", is_dir: true, size: null },
];

describe("buildRepoTree", () => {
  it("nests files under folders and sorts folders first", () => {
    const tree = buildRepoTree(entries);
    expect(tree.map((n) => n.name)).toEqual(["docs", "src", "README.md"]);
    const src = tree.find((n) => n.kind === "folder" && n.name === "src");
    expect(src?.kind).toBe("folder");
    if (src?.kind === "folder") {
      expect(src.children.map((c) => c.name)).toEqual(["index.ts"]);
    }
  });
});

describe("collectFolderPaths", () => {
  it("returns all folder paths", () => {
    const tree = buildRepoTree(entries);
    expect(collectFolderPaths(tree).sort()).toEqual(["docs", "src"]);
  });
});

describe("firstFilePath", () => {
  it("returns the first file depth-first", () => {
    const tree = buildRepoTree(entries);
    expect(firstFilePath(tree)).toBe("docs/prd.md");
  });
});
