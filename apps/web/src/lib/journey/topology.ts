/**
 * Solution Topology model (GIN-430) — pure model, validation, layout tiers and
 * Mermaid export. A real Architect agent would recommend this; here it's a
 * deterministic seed the canvas + table both render and validate.
 */

export type LayerType =
  | "frontend"
  | "mobile"
  | "api"
  | "service"
  | "worker"
  | "data"
  | "analytics"
  | "integration"
  | "infra"
  | "shared"
  | "custom";

export const LAYER_TYPE_LABEL: Record<LayerType, string> = {
  frontend: "Frontend / web",
  mobile: "Mobile / desktop",
  api: "API / gateway",
  service: "Domain service",
  worker: "Worker / job",
  data: "Data store",
  analytics: "Analytics / pipeline",
  integration: "Integration",
  infra: "Infrastructure",
  shared: "Shared package",
  custom: "Custom",
};

/** Vertical tier for canvas auto-layout (0 = top). */
export const LAYER_TIER: Record<LayerType, number> = {
  frontend: 0,
  mobile: 0,
  api: 1,
  service: 2,
  worker: 2,
  integration: 2,
  analytics: 2,
  data: 3,
  infra: 3,
  shared: 3,
  custom: 2,
};

export interface ILayer {
  id: string;
  name: string;
  type: LayerType;
  purpose: string;
  tech: string;
  repo: string;
  owner: string | null;
  environments: string[];
  dataClass: "public" | "internal" | "confidential" | "none";
  maturity: "planned" | "building" | "live";
}

export interface IDependency {
  from: string;
  to: string;
  interface: string;
  rationale: string;
}

export interface ITopology {
  layers: ILayer[];
  dependencies: IDependency[];
}

export type IssueSeverity = "error" | "warning";
export interface ITopologyIssue {
  severity: IssueSeverity;
  kind: string;
  message: string;
  layerId?: string;
}

/** Detect a directed cycle in the dependency graph. */
function hasCycle(topology: ITopology): boolean {
  const adj = new Map<string, string[]>();
  for (const l of topology.layers) adj.set(l.id, []);
  for (const d of topology.dependencies) adj.get(d.from)?.push(d.to);
  const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 in-stack, 2 done
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of adj.get(id) ?? []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  return topology.layers.some((l) => visit(l.id));
}

/**
 * Validate the topology. Errors block readiness (declared mandatory rules);
 * warnings can be acknowledged.
 */
export function validateTopology(topology: ITopology): ITopologyIssue[] {
  const issues: ITopologyIssue[] = [];
  const connected = new Set<string>();
  for (const d of topology.dependencies) {
    connected.add(d.from);
    connected.add(d.to);
    if (!d.interface.trim()) {
      issues.push({
        severity: "error",
        kind: "undefined-interface",
        message: `Dependency ${d.from} → ${d.to} has no interface defined.`,
        layerId: d.from,
      });
    }
  }
  for (const l of topology.layers) {
    if (!l.owner) {
      issues.push({ severity: "warning", kind: "missing-owner", message: `${l.name} has no owner.`, layerId: l.id });
    }
    if (topology.layers.length > 1 && !connected.has(l.id)) {
      issues.push({ severity: "warning", kind: "orphan-layer", message: `${l.name} is not connected to any layer.`, layerId: l.id });
    }
  }
  if (hasCycle(topology)) {
    issues.push({ severity: "error", kind: "dependency-cycle", message: "The topology contains a dependency cycle." });
  }
  return issues;
}

/** Realistic starting topology (recommended-from-PRD stand-in). Includes one
 *  unowned layer so validation has something to surface. */
export function seedTopology(): ITopology {
  const layers: ILayer[] = [
    { id: "web", name: "Web frontend", type: "frontend", purpose: "Customer web app", tech: "Next.js", repo: "acme/web", owner: "Web team", environments: ["prod", "staging"], dataClass: "internal", maturity: "building" },
    { id: "mobile", name: "Mobile app", type: "mobile", purpose: "iOS / Android app", tech: "React Native", repo: "acme/mobile", owner: "Mobile team", environments: ["prod"], dataClass: "internal", maturity: "planned" },
    { id: "api", name: "Application API", type: "api", purpose: "Public gateway", tech: "FastAPI", repo: "acme/api", owner: "Platform team", environments: ["prod", "staging"], dataClass: "confidential", maturity: "building" },
    { id: "core", name: "Core service", type: "service", purpose: "Domain logic", tech: "Python", repo: "acme/api", owner: null, environments: ["prod"], dataClass: "confidential", maturity: "planned" },
    { id: "worker", name: "Background jobs", type: "worker", purpose: "Async processing", tech: "Celery", repo: "acme/api", owner: "Platform team", environments: ["prod"], dataClass: "internal", maturity: "planned" },
    { id: "data", name: "Primary data", type: "data", purpose: "Transactional store", tech: "Postgres", repo: "—", owner: "Platform team", environments: ["prod", "staging"], dataClass: "confidential", maturity: "live" },
    { id: "integrations", name: "External integrations", type: "integration", purpose: "3rd-party connectors", tech: "REST/webhooks", repo: "acme/api", owner: "Platform team", environments: ["prod"], dataClass: "confidential", maturity: "planned" },
  ];
  const dependencies: IDependency[] = [
    { from: "web", to: "api", interface: "REST", rationale: "UI reads/writes via the gateway" },
    { from: "mobile", to: "api", interface: "REST", rationale: "App reads/writes via the gateway" },
    { from: "api", to: "core", interface: "in-process", rationale: "Gateway delegates to domain logic" },
    { from: "core", to: "data", interface: "SQL", rationale: "Persist transactional state" },
    { from: "core", to: "integrations", interface: "REST", rationale: "Call external providers" },
    { from: "worker", to: "data", interface: "SQL", rationale: "Process queued work" },
  ];
  return { layers, dependencies };
}

/** C4-ish Mermaid flowchart for export. */
export function toMermaid(topology: ITopology): string {
  const nodes = topology.layers.map((l) => `  ${l.id}["${l.name}"]`).join("\n");
  const edges = topology.dependencies.map((d) => `  ${d.from} -->|${d.interface}| ${d.to}`).join("\n");
  return `flowchart TD\n${nodes}\n${edges}`;
}
