import type { IWorkspaceEntry } from "@/types";

export type IRepoTreeNode =
  | { kind: "folder"; name: string; path: string; children: IRepoTreeNode[] }
  | { kind: "file"; name: string; path: string };

/** Build a nested tree from the flat, POSIX-relative workspace entry list. */
export function buildRepoTree(entries: IWorkspaceEntry[]): IRepoTreeNode[] {
  const root: IRepoTreeNode[] = [];
  const sorted = entries.toSorted((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const parts = entry.path.split("/").filter(Boolean);
    if (!parts.length) continue;
    const leaf = parts[parts.length - 1];
    let level = root;
    let currentPath = "";

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folder = level.find(
        (n): n is Extract<IRepoTreeNode, { kind: "folder" }> =>
          n.kind === "folder" && n.name === part,
      );
      if (!folder) {
        folder = { kind: "folder", name: part, path: currentPath, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }

    const leafPath = currentPath ? `${currentPath}/${leaf}` : leaf;

    if (entry.is_dir) {
      if (!level.some((n) => n.kind === "folder" && n.name === leaf)) {
        level.push({ kind: "folder", name: leaf, path: leafPath, children: [] });
      }
    } else if (!level.some((n) => n.kind === "file" && n.name === leaf)) {
      level.push({ kind: "file", name: leaf, path: leafPath });
    }
  }

  const sortNodes = (nodes: IRepoTreeNode[]): IRepoTreeNode[] =>
    nodes
      .toSorted((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => (n.kind === "folder" ? { ...n, children: sortNodes(n.children) } : n));

  return sortNodes(root);
}

export function collectFolderPaths(nodes: IRepoTreeNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind === "folder") {
      out.push(node.path);
      out.push(...collectFolderPaths(node.children));
    }
  }
  return out;
}

/** First file (depth-first) so we can preview something on mount. */
export function firstFilePath(nodes: IRepoTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === "file") return node.path;
    const found = firstFilePath(node.children);
    if (found) return found;
  }
  return null;
}
