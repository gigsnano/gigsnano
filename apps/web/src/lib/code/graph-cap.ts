import { computeVisibleGraph, type TModuleTree } from "./module-tree";

/** Open the top-level modules, then drill through any chain of single-child
 * buckets (real repos often nest everything under one dir, e.g. `src/gigsnano_api/`)
 * until reaching a branch point (>1 child bucket) — open that too, so its children
 * form the first-paint frontier. Never descends into leaves. */
export function defaultOpenKeys(tree: TModuleTree, roots: string[] = ["src"]): Set<string> {
  const childrenOf = new Map<string, Set<string>>();
  for (const chain of tree.chains.values()) {
    for (let i = 0; i < chain.length - 1; i++) {
      const parent = chain[i];
      const child = chain[i + 1];
      if (tree.leafRealId.has(child)) continue; // only bucket children count
      (childrenOf.get(parent) ?? childrenOf.set(parent, new Set()).get(parent)!).add(child);
    }
  }

  const open = new Set<string>();
  const present = new Set(tree.modules.map((m) => m.key));
  for (const r of roots) {
    if (!present.has(r)) continue;
    open.add(r);
    let current = r;
    for (;;) {
      const kids = childrenOf.get(current);
      if (!kids || kids.size !== 1) break;
      const [only] = kids;
      open.add(only);
      current = only;
    }
  }
  return open;
}

/** Guard against flooding vis-network: if `open` yields more than `maxNodes`
 * visible nodes, drop the deepest (longest-key) open buckets until at/under cap. */
export function capOpenKeys(
  tree: TModuleTree,
  open: Set<string>,
  maxNodes: number,
  hidden: Set<string> = new Set<string>(),
): { open: Set<string>; capped: boolean } {
  const keys = [...open].sort((a, b) => b.length - a.length); // deepest first
  const working = new Set(open);
  let capped = false;
  while (computeVisibleGraph(tree, working, hidden).nodes.length > maxNodes && keys.length) {
    const drop = keys.shift();
    if (drop == null) break;
    working.delete(drop);
    capped = true;
  }
  return { open: working, capped };
}
