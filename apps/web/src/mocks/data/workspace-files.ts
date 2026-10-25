import type { IWorkspaceEntry } from "@/types";

/** Sample workspace tree for mock brownfield projects (clone ready). */
const MOCK_WORKSPACE_TREE: IWorkspaceEntry[] = [
  { path: "README.md", is_dir: false, size: 420 },
  { path: "package.json", is_dir: false, size: 890 },
  { path: "src", is_dir: true, size: null },
  { path: "src/index.ts", is_dir: false, size: 1200 },
  { path: "src/components", is_dir: true, size: null },
  { path: "src/components/app.tsx", is_dir: false, size: 2400 },
  { path: "docs", is_dir: true, size: null },
  { path: "docs/prd.md", is_dir: false, size: 5600 },
];

const MOCK_WORKSPACE_FILES: Record<string, string> = {
  "README.md": `# Sample Repository

This is a **simulated clone** for local development.

## Getting started

\`\`\`bash
pnpm install
pnpm dev
\`\`\`
`,
  "package.json": `{
  "name": "sample-repo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  }
}
`,
  "src/index.ts": `export { App } from "./components/app";

console.log("Workspace file preview is live.");
`,
  "src/components/app.tsx": `export function App() {
  return (
    <main>
      <h1>Hello from the cloned repo</h1>
    </main>
  );
}
`,
  "docs/prd.md": `# Product Requirements

## Overview

Generated BMAD planning artifact mirrored to disk.

## Goals

- Browse cloned repository files
- Preview markdown and source code inline
`,
};

export function mockWorkspaceTreeForProject(
  repoFullName: string | null,
  cloneReady: boolean,
): IWorkspaceEntry[] {
  if (!repoFullName || !cloneReady) return [];
  return MOCK_WORKSPACE_TREE;
}

export function mockWorkspaceFileContent(path: string): string | null {
  return MOCK_WORKSPACE_FILES[path] ?? null;
}
