import type {
  CodeNode,
  CodeNodeType,
  CodeRelation,
  CodeRelationType,
  ERiskLevel,
} from "@/types/code/intelligence";

/** Active toolbar + metric filters for the typed relation graph. */
export interface ICodebaseFilters {
  nodeTypes: Set<CodeNodeType>;
  modules: Set<string>;
  relations: Set<CodeRelationType>;
  risk?: ERiskLevel;
  query: string;
  preset?: "cycles" | "hotspots";
}

export function emptyFilters(): ICodebaseFilters {
  return { nodeTypes: new Set(), modules: new Set(), relations: new Set(), query: "" };
}

export function hasActiveFilters(f: ICodebaseFilters): boolean {
  return (
    f.nodeTypes.size > 0 ||
    f.modules.size > 0 ||
    f.relations.size > 0 ||
    f.risk != null ||
    f.preset != null ||
    f.query.trim().length > 0
  );
}

const riskRank: Record<ERiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** Pure: keep nodes matching every active filter, then keep only relations whose
 * endpoints both survive. Nothing is mutated. */
export function filterTypedGraph(
  nodes: CodeNode[],
  relations: CodeRelation[],
  f: ICodebaseFilters,
): { nodes: CodeNode[]; relations: CodeRelation[] } {
  const q = f.query.trim().toLowerCase();

  const keptNodes = nodes.filter((n) => {
    if (f.nodeTypes.size > 0 && !f.nodeTypes.has(n.type)) return false;
    if (f.modules.size > 0 && !(n.module && f.modules.has(n.module))) return false;
    if (f.risk != null && riskRank[n.risk ?? "low"] < riskRank[f.risk]) return false;
    if (f.preset === "hotspots" && n.risk !== "high") return false;
    if (q && !n.name.toLowerCase().includes(q) && !(n.path?.toLowerCase().includes(q) ?? false))
      return false;
    return true;
  });

  const kept = new Set(keptNodes.map((n) => n.id));
  const keptRelations = relations.filter((r) => {
    if (f.relations.size > 0 && !f.relations.has(r.type)) return false;
    if (f.preset === "cycles" && r.type !== "imports" && r.type !== "changed_with") return false;
    return kept.has(r.source) && kept.has(r.target);
  });

  return { nodes: keptNodes, relations: keptRelations };
}

/** Relationship presets that back the Call/API/Data flow views. */
export const FLOW_RELATIONS: Record<string, CodeRelationType[]> = {
  "call-flow": ["calls", "contains"],
  "api-flow": ["exposes_api", "consumes_api", "calls"],
  "data-flow": ["reads", "writes"],
  dependencies: ["imports", "contains", "calls"],
};
