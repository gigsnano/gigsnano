/**
 * Existing-project discovery model (GIN-432) — pure model + baseline math.
 *
 * The brownfield route establishes current truth from evidence before proposing
 * change. Inferred items carry confidence and must be confirmed; automated
 * discovery never silently establishes the baseline.
 */

export type EvidenceKind = "repository" | "document" | "deployment" | "design" | "backlog";
export type EvidenceStatus = "confirmed" | "attention" | "unknown";

export interface IEvidenceItem {
  id: string;
  kind: EvidenceKind;
  name: string;
  status: EvidenceStatus;
  /** 0–1 inference confidence. */
  confidence: number;
  note?: string;
}

export type ComponentType = "frontend" | "mobile" | "api" | "service" | "worker" | "data" | "integration";

export interface IDetectedComponent {
  id: string;
  name: string;
  type: ComponentType;
  confidence: number;
  evidence: string;
  confirmed: boolean;
}

export interface IDiscovery {
  evidence: IEvidenceItem[];
  components: IDetectedComponent[];
}

export const DISCOVERY_PHASES = ["Connect", "Discover", "Baseline", "Change", "Plan", "Deliver"] as const;
export type DiscoveryPhase = (typeof DISCOVERY_PHASES)[number];

/** Baseline confirmation progress + open unknowns. */
export function baselineProgress(evidence: IEvidenceItem[]): { confirmedPct: number; unknowns: number; attention: number } {
  const total = evidence.length || 1;
  const confirmed = evidence.filter((e) => e.status === "confirmed").length;
  return {
    confirmedPct: Math.round((confirmed / total) * 100),
    unknowns: evidence.filter((e) => e.status === "unknown").length,
    attention: evidence.filter((e) => e.status === "attention").length,
  };
}

/** The single recommended next action from unresolved evidence. */
export function nextDiscoveryAction(evidence: IEvidenceItem[]): string {
  const attention = evidence.find((e) => e.status === "attention");
  if (attention) return `Confirm ${attention.name}`;
  const unknown = evidence.find((e) => e.status === "unknown");
  if (unknown) return `Resolve ${unknown.name}`;
  return "Approve the current-state baseline";
}

export function seedDiscovery(): IDiscovery {
  return {
    evidence: [
      { id: "web", kind: "repository", name: "web repository", status: "confirmed", confidence: 0.95 },
      { id: "services", kind: "repository", name: "services repository", status: "confirmed", confidence: 0.9 },
      { id: "mobile", kind: "repository", name: "mobile ownership", status: "attention", confidence: 0.6, note: "Owner unclear" },
      { id: "prod-topo", kind: "deployment", name: "production topology", status: "unknown", confidence: 0.3, note: "No manifests connected" },
      { id: "arch-doc", kind: "document", name: "architecture guide", status: "confirmed", confidence: 0.8 },
      { id: "backlog", kind: "backlog", name: "existing backlog", status: "confirmed", confidence: 0.85 },
    ],
    components: [
      { id: "web-app", name: "Web app", type: "frontend", confidence: 0.95, evidence: "web repository", confirmed: true },
      { id: "api", name: "Application API", type: "api", confidence: 0.9, evidence: "services repository", confirmed: true },
      { id: "db", name: "PostgreSQL", type: "data", confidence: 0.85, evidence: "services config", confirmed: true },
      { id: "worker", name: "Background worker", type: "worker", confidence: 0.7, evidence: "services repository", confirmed: false },
      { id: "mobile-app", name: "Mobile app", type: "mobile", confidence: 0.55, evidence: "app-store listing", confirmed: false },
    ],
  };
}
