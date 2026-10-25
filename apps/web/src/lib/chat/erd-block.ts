import type { IErdColumn, IErdRelation, IErdSchema, IErdTable } from "@/types";

// Matches ```gigs:erd\n{...}\n``` blocks (non-greedy, across lines).
const BLOCK_RE = /```gigs:erd\n([\s\S]*?)\n```/g;

/** A parsed `gigs:erd` block. `schema` is absent when the block only carries raw `dbml`. */
export interface IErdBlock {
  id: string;
  dbml?: string;
  schema?: IErdSchema;
}

function parseColumn(raw: unknown): IErdColumn[] {
  if (typeof raw !== "object" || raw === null) return [];
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.type !== "string") return [];
  const col: IErdColumn = { name: o.name, type: o.type };
  if (typeof o.pk === "boolean") col.pk = o.pk;
  if (typeof o.fk === "boolean") col.fk = o.fk;
  if (typeof o.nullable === "boolean") col.nullable = o.nullable;
  return [col];
}

function parseTable(raw: unknown): IErdTable[] {
  if (typeof raw !== "object" || raw === null) return [];
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name) return [];
  const columns = Array.isArray(o.columns) ? o.columns.flatMap(parseColumn) : [];
  const table: IErdTable = { name: o.name, columns };
  if (typeof o.file === "string") table.file = o.file;
  return [table];
}

function parseRelation(raw: unknown, names: Set<string>): IErdRelation[] {
  if (typeof raw !== "object" || raw === null) return [];
  const o = raw as Record<string, unknown>;
  if (
    typeof o.from_table !== "string" ||
    typeof o.from_column !== "string" ||
    typeof o.to_table !== "string" ||
    typeof o.to_column !== "string"
  )
    return [];
  if (!names.has(o.from_table) || !names.has(o.to_table)) return [];
  const rel: IErdRelation = {
    from_table: o.from_table,
    from_column: o.from_column,
    to_table: o.to_table,
    to_column: o.to_column,
  };
  const CARDINALITIES = new Set(["one-to-one", "one-to-many", "many-to-one", "many-to-many"]);
  if (typeof o.cardinality === "string" && CARDINALITIES.has(o.cardinality)) {
    rel.cardinality = o.cardinality as IErdRelation["cardinality"];
  }
  return [rel];
}

function parseSchema(raw: unknown, fallbackId: string): IErdSchema | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const tables = Array.isArray(o.tables) ? o.tables.flatMap(parseTable) : [];
  if (tables.length === 0) return undefined;
  const names = new Set(tables.map((t) => t.name));
  const relations = Array.isArray(o.relations) ? o.relations.flatMap((r) => parseRelation(r, names)) : [];
  const schema: IErdSchema = {
    id: typeof o.id === "string" && o.id ? o.id : fallbackId,
    tables,
    relations,
  };
  if (typeof o.based_on_sha === "string") schema.based_on_sha = o.based_on_sha;
  return schema;
}

/** Extract `gigs:erd` fenced JSON blocks. Invalid blocks (bad JSON, no schema and no dbml) are skipped. */
export function parseErdBlocks(text: string): IErdBlock[] {
  const blocks: IErdBlock[] = [];
  let index = 0;
  for (const match of text.matchAll(BLOCK_RE)) {
    const i = index;
    index += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const o = parsed as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id : `erd-${i}`;
    const schema = parseSchema(o.schema, id);
    const dbml = typeof o.dbml === "string" && o.dbml ? o.dbml : undefined;
    if (!schema && !dbml) continue;
    const block: IErdBlock = { id };
    if (dbml) block.dbml = dbml;
    if (schema) block.schema = schema;
    blocks.push(block);
  }
  return blocks;
}

/** Text with `gigs:erd` blocks removed, for clean display. */
export function stripErdBlocks(text: string): string {
  return text.replace(BLOCK_RE, "").trim();
}
