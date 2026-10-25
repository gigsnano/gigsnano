import {
  EBlueprintLifecycle,
  type IBlueprintDefinition,
} from "@/types/solution/blueprint";
import type { ESolutionKey } from "@/types/solution/solution";
import type {
  IBlueprintRecommendation,
  IRecommendationResult,
  IRecommendationSignal,
} from "@/types/solution/install-plan";

/**
 * Blueprint recommendation (GIN-452).
 *
 * Eligibility is a hard, deterministic gate; scoring is a sum of explainable
 * signals. Nothing here is model output — an LLM may reorder the *prose*, but
 * it can never make an ineligible blueprint installable.
 */

/** Approved intake evidence the ranking reads. All fields optional. */
export interface IRecommendationEvidence {
  solution_key: ESolutionKey;
  /** Solution definition version installed in this workspace. */
  solution_version: number;
  /** Intake journey the user actually took (e.g. `idea`, `repository`). */
  journey_key: string | null;
  /** Connector keys the workspace already has usable connections for. */
  connected_connectors: string[];
  /** Logical keys from the approved structure proposal (GIN-449). */
  proposal_node_keys: string[];
  /** Parameter keys the user has already decided. */
  decided_parameters: string[];
}

const SIGNALS = {
  journeyMatch: { code: "journey_match", label: "Matches your setup path", weight: 0.35 },
  journeyMismatch: {
    code: "journey_mismatch",
    label: "Built for a different setup path",
    weight: -0.2,
  },
  connectorsReady: {
    code: "connectors_ready",
    label: "Integrations it needs are already connected",
    weight: 0.25,
  },
  connectorsMissing: {
    code: "connectors_missing",
    label: "Needs integrations you have not connected yet",
    weight: -0.1,
  },
  structureCoverage: {
    code: "structure_coverage",
    label: "Covers the structure you approved",
    weight: 0.25,
  },
  parametersResolved: {
    code: "parameters_resolved",
    label: "Its questions are already answered",
    weight: 0.15,
  },
  builtIn: { code: "built_in", label: "Maintained by GigsNano", weight: 0.05 },
} as const;

const INSTALLABLE_LIFECYCLES: ReadonlySet<EBlueprintLifecycle> = new Set([
  EBlueprintLifecycle.Approved,
  EBlueprintLifecycle.Deprecated,
]);

function ineligible(
  definition: IBlueprintDefinition,
  rationale: string,
): IBlueprintRecommendation {
  return {
    blueprint_key: definition.identity.key,
    blueprint_version: definition.identity.version,
    name: definition.identity.name,
    score: 0,
    rationale,
    signals: [],
    eligible: false,
  };
}

/** Hard gates. A blueprint failing any of these can never be recommended. */
function checkEligibility(
  definition: IBlueprintDefinition,
  evidence: IRecommendationEvidence,
): string | null {
  if (definition.identity.solution_key !== evidence.solution_key) {
    return "Built for a different solution.";
  }
  if (!INSTALLABLE_LIFECYCLES.has(definition.lifecycle)) {
    return `This blueprint is ${definition.lifecycle} and cannot be installed.`;
  }
  if (definition.identity.solution_version_min > evidence.solution_version) {
    return `Requires solution version ${definition.identity.solution_version_min}; this workspace is on ${evidence.solution_version}.`;
  }
  return null;
}

function scoreBlueprint(
  definition: IBlueprintDefinition,
  evidence: IRecommendationEvidence,
): IRecommendationSignal[] {
  const signals: IRecommendationSignal[] = [];

  if (definition.journey_ref) {
    signals.push(
      definition.journey_ref === evidence.journey_key
        ? { ...SIGNALS.journeyMatch }
        : { ...SIGNALS.journeyMismatch },
    );
  }

  const required = definition.integrations.map((i) => i.connector_key);
  if (required.length > 0) {
    const connected = required.filter((key) => evidence.connected_connectors.includes(key));
    signals.push(
      connected.length === required.length
        ? { ...SIGNALS.connectorsReady }
        : {
            ...SIGNALS.connectorsMissing,
            weight:
              SIGNALS.connectorsMissing.weight *
              ((required.length - connected.length) / required.length),
          },
    );
  }

  if (definition.domains.length > 0 && evidence.proposal_node_keys.length > 0) {
    const covered = definition.domains.filter((d) =>
      evidence.proposal_node_keys.includes(d.key),
    ).length;
    signals.push({
      ...SIGNALS.structureCoverage,
      weight: SIGNALS.structureCoverage.weight * (covered / definition.domains.length),
    });
  }

  const requiredParams = definition.parameters.filter((p) => p.required);
  if (requiredParams.length > 0) {
    const answered = requiredParams.filter((p) =>
      evidence.decided_parameters.includes(p.key),
    ).length;
    signals.push({
      ...SIGNALS.parametersResolved,
      weight: SIGNALS.parametersResolved.weight * (answered / requiredParams.length),
    });
  }

  if (definition.visibility === "built_in") {
    signals.push({ ...SIGNALS.builtIn });
  }

  return signals;
}

function describe(
  definition: IBlueprintDefinition,
  signals: IRecommendationSignal[],
): string {
  const positive = signals.filter((s) => s.weight > 0).map((s) => s.label.toLowerCase());
  if (positive.length === 0) {
    return `${definition.identity.name} is compatible, but nothing in your setup points to it specifically.`;
  }
  return `${definition.identity.name} fits because it ${positive.join(", and ")}.`;
}

/**
 * Rank candidates. Ties break on blueprint key so the same evidence always
 * produces the same order.
 */
export function recommendBlueprints(
  catalogue: IBlueprintDefinition[],
  evidence: IRecommendationEvidence,
): IRecommendationResult {
  const ranked = catalogue
    .map((definition) => {
      const reason = checkEligibility(definition, evidence);
      if (reason) return ineligible(definition, reason);

      const signals = scoreBlueprint(definition, evidence);
      const raw = signals.reduce((sum, s) => sum + s.weight, 0);
      return {
        blueprint_key: definition.identity.key,
        blueprint_version: definition.identity.version,
        name: definition.identity.name,
        score: Math.min(1, Math.max(0, Number(raw.toFixed(4)))),
        rationale: describe(definition, signals),
        signals,
        eligible: true,
      } satisfies IBlueprintRecommendation;
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.blueprint_key.localeCompare(b.blueprint_key);
    });

  const top = ranked.find((r) => r.eligible && r.score > 0) ?? null;

  return {
    recommended: top,
    alternatives: ranked.filter((r) => r !== top),
    blank_available: true,
  };
}
