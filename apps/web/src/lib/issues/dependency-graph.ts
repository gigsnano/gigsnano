import { EStoryRelationType, type IProjectRelation, type IStory } from "@/types";

/** Why two stories are connected. Containment and blocking are different claims and
 * must never render identically: a parent *contains* its child, a blocker *gates* it. */
export type TDepEdgeKind = "parent" | EStoryRelationType;

export interface IDepNode {
  id: string;
  story: IStory;
  /** Layout column: 0 = root (no parent), depth+1 per level of containment. */
  depth: number;
}

export interface IDepEdge {
  id: string;
  source: string;
  target: string;
  kind: TDepEdgeKind;
}

export interface IDepGraph {
  nodes: IDepNode[];
  edges: IDepEdge[];
  /** Stories in a `blocking`/`blocked_by` cycle. A cycle is never legitimate — it means
   * the work can't start at all — so callers surface it rather than quietly drawing it. */
  cycleNodeIds: Set<string>;
  /** Items dropped for having no edges at all. Surfaced, never silent: the graph shows
   * a subset of what the filters matched, and the user must be told so. */
  isolatedCount: number;
}

/** `blocked_by` is the mirror of `blocking`. Normalising to a single direction keeps
 * cycle detection honest: A blocks B and B blocked_by A are one edge, not two. */
function normalize(rel: IProjectRelation): { source: string; target: string } | null {
  if (rel.relation_type === EStoryRelationType.BlockedBy) {
    return { source: rel.related_story_id, target: rel.story_id };
  }
  return { source: rel.story_id, target: rel.related_story_id };
}

/** Only blocking edges can deadlock. `relates_to`/`duplicate` are annotations, not
 * ordering, so a loop of them is meaningless, not a defect. */
function isBlocking(kind: TDepEdgeKind): boolean {
  return kind === EStoryRelationType.Blocks || kind === EStoryRelationType.BlockedBy;
}

/** Depth by walking up `parent_id`. Guards against a parent cycle (data corruption, but
 * an infinite loop here would hang the render, so it's cheap insurance). */
function depthOf(story: IStory, byId: Map<string, IStory>): number {
  let depth = 0;
  const seen = new Set<string>([story.id]);
  let cur = story.parent_id ? byId.get(story.parent_id) : undefined;
  while (cur && !seen.has(cur.id)) {
    depth += 1;
    seen.add(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return depth;
}

/** Iterative DFS over blocking edges only; returns every node on a cycle. Iterative
 * rather than recursive so a deep chain can't blow the stack. */
function findCycles(nodeIds: string[], edges: IDepEdge[]): Set<string> {
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!isBlocking(e.kind)) continue;
    const list = out.get(e.source);
    if (list) list.push(e.target);
    else out.set(e.source, [e.target]);
  }

  const cycles = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on-stack, 2 done

  for (const root of nodeIds) {
    if (state.get(root)) continue;
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
    const path: string[] = [];
    state.set(root, 1);
    path.push(root);

    while (stack.length) {
      const frame = stack[stack.length - 1];
      const kids = out.get(frame.id) ?? [];
      if (frame.next < kids.length) {
        const kid = kids[frame.next++];
        const s = state.get(kid) ?? 0;
        if (s === 1) {
          // Back-edge: everything from `kid` to the top of the path is on the cycle.
          const from = path.indexOf(kid);
          if (from !== -1) for (const id of path.slice(from)) cycles.add(id);
        } else if (s === 0) {
          state.set(kid, 1);
          path.push(kid);
          stack.push({ id: kid, next: 0 });
        }
      } else {
        state.set(frame.id, 2);
        stack.pop();
        path.pop();
      }
    }
  }
  return cycles;
}

/**
 * Build the work-item dependency graph: containment (`parent_id`) plus relation edges.
 *
 * Both edge kinds in one graph is deliberate (GIN-159). Hierarchy is what actually has
 * data — 559 of 974 stories had a parent when this was written, while `story_relations`
 * had zero rows — so a relations-only graph would render an empty canvas on every
 * project. Hierarchy carries the view; relation edges light up as people create them.
 *
 * Edges pointing outside `stories` are dropped: the caller passes the *filtered* list,
 * so an edge to a filtered-out story would otherwise be an arrow into nothing.
 *
 * Items with no edges at all are dropped too, and counted in `isolatedCount`. An item
 * with no parent, no children and no relations carries no dependency information — on a
 * real project that is most of the backlog, and drawing them turns the graph into a
 * column of disconnected cards that buries the structure it exists to show.
 */
export function buildDependencyGraph(
  stories: IStory[],
  relations: IProjectRelation[] = [],
): IDepGraph {
  const byId = new Map(stories.map((s) => [s.id, s]));

  const edges: IDepEdge[] = [];
  const seen = new Set<string>();

  for (const s of stories) {
    if (s.parent_id && byId.has(s.parent_id)) {
      edges.push({
        id: `parent:${s.parent_id}->${s.id}`,
        source: s.parent_id,
        target: s.id,
        kind: "parent",
      });
    }
  }

  for (const rel of relations) {
    const dir = normalize(rel);
    if (!dir || !byId.has(dir.source) || !byId.has(dir.target)) continue;
    // A blocks B and B blocked_by A normalise to the same edge — keep one.
    const kind = rel.relation_type === EStoryRelationType.BlockedBy
      ? EStoryRelationType.Blocks
      : rel.relation_type;
    const id = `${kind}:${dir.source}->${dir.target}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source: dir.source, target: dir.target, kind });
  }

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }

  const nodes: IDepNode[] = stories
    .filter((s) => connected.has(s.id))
    .map((s) => ({ id: s.id, story: s, depth: depthOf(s, byId) }));

  return {
    nodes,
    edges,
    cycleNodeIds: findCycles(
      nodes.map((n) => n.id),
      edges,
    ),
    isolatedCount: stories.length - nodes.length,
  };
}
