import type { IErdRelation, IErdSchema } from "@/types";

/** Direct (1-hop) FK neighbors of `root`, incl. root itself. Liam-style focus:
 *  on a large schema, transitive-connectivity highlights nearly everything, so
 *  clicking a table should surface only what it directly relates to. */
export function directNeighbors(schema: IErdSchema, root: string): Set<string> {
  const set = new Set<string>([root]);
  for (const r of schema.relations) {
    if (r.from_table === root) set.add(r.to_table);
    if (r.to_table === root) set.add(r.from_table);
  }
  return set;
}

/** The relations a table participates in, split by direction (for the details
 *  panel): `references` = its outgoing FKs, `referencedBy` = incoming FKs. */
export function tableRelations(
  schema: IErdSchema,
  table: string,
): { references: IErdRelation[]; referencedBy: IErdRelation[] } {
  return {
    references: schema.relations.filter((r) => r.from_table === table),
    referencedBy: schema.relations.filter((r) => r.to_table === table),
  };
}

/** BFS over `relations` (undirected) from `root`; returns transitively-connected table names (incl. root). */
export function connectedTables(schema: IErdSchema, root: string): Set<string> {
  const adj = new Map<string, Set<string>>();
  for (const r of schema.relations) {
    (adj.get(r.from_table) ?? adj.set(r.from_table, new Set()).get(r.from_table)!).add(r.to_table);
    (adj.get(r.to_table) ?? adj.set(r.to_table, new Set()).get(r.to_table)!).add(r.from_table);
  }
  const seen = new Set<string>([root]);
  const queue = [root];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of adj.get(cur) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}
