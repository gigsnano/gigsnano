import {
  ESolutionAvailability,
  ESolutionCapability,
  ESolutionKey,
  type ISetupDraft,
  type ISolutionDefinition,
  type ISolutionNavigationEntry,
  type ISolutionRegistry,
  type ISolutionStartingPoint,
} from "@/types";

/**
 * Pure lookup, validation and gating over the solution registry (GIN-443).
 * The definitions themselves are backend data — these helpers never hold a
 * catalogue, they only reason about one the caller supplies.
 */

const SOLUTION_KEYS = new Set<string>(Object.values(ESolutionKey));
const CAPABILITIES = new Set<string>(Object.values(ESolutionCapability));

/** True when `key` is a known solution key. */
export function isSolutionKey(key: string): key is ESolutionKey {
  return SOLUTION_KEYS.has(key);
}

/**
 * Narrow an untrusted key, with a message naming the valid options — the
 * "actionable error" the acceptance criteria ask for on an invalid key.
 */
export function parseSolutionKey(key: string): ESolutionKey {
  if (!isSolutionKey(key)) {
    throw new Error(
      `Unknown solution "${key}". Valid solutions: ${[...SOLUTION_KEYS].sort().join(", ")}.`,
    );
  }
  return key;
}

export function findSolution(
  registry: ISolutionRegistry,
  key: string,
): ISolutionDefinition | null {
  return registry.solutions.find((s) => s.key === key) ?? null;
}

/**
 * Resolve a definition or explain why it can't be used. Rejects unknown keys and
 * keys the workspace has switched off, so a disabled solution can't be reached
 * by guessing a URL or replaying a request.
 */
export function resolveSelectableSolution(
  registry: ISolutionRegistry,
  key: string,
): ISolutionDefinition {
  const solution = findSolution(registry, parseSolutionKey(key));
  if (!solution) {
    throw new Error(`Solution "${key}" is not available in this workspace.`);
  }
  if (!isSolutionSelectable(solution)) {
    throw new Error(
      solution.availability_reason ??
        `${solution.name} is not enabled for this workspace.`,
    );
  }
  return solution;
}

/** Only fully-available solutions can start a setup. */
export function isSolutionSelectable(solution: ISolutionDefinition): boolean {
  return solution.availability === ESolutionAvailability.Available;
}

export function hasCapability(
  solution: ISolutionDefinition,
  capability: ESolutionCapability,
): boolean {
  return solution.capabilities.includes(capability);
}

/** Starting points the solution's capabilities actually support. */
export function availableStartingPoints(
  solution: ISolutionDefinition,
): ISolutionStartingPoint[] {
  return solution.starting_points.filter(
    (point) =>
      point.requires_capability === null || hasCapability(solution, point.requires_capability),
  );
}

/** The starting point to preselect: the recommended one, else the first valid. */
export function recommendedStartingPoint(
  solution: ISolutionDefinition,
): ISolutionStartingPoint | null {
  const points = availableStartingPoints(solution);
  return points.find((p) => p.recommended) ?? points[0] ?? null;
}

/**
 * The human label for a stored starting-point key. Keys are persisted on drafts
 * and containers; only the definition knows what to call them, so no UI should
 * print the raw key.
 */
export function startingPointLabel(
  solution: ISolutionDefinition | null,
  key: string | null,
): string | null {
  if (!solution || !key) return null;
  return solution.starting_points.find((point) => point.key === key)?.label ?? null;
}

/** Navigation entries the container is allowed to show (GIN-447 consumes this). */
export function solutionNavigation(
  solution: ISolutionDefinition,
): ISolutionNavigationEntry[] {
  return solution.navigation.filter(
    (entry) =>
      entry.requires_capability === null || hasCapability(solution, entry.requires_capability),
  );
}

/**
 * A draft written against an older definition version. Resuming one has to
 * re-validate rather than trust the stored answers, because the questions may
 * have changed underneath it.
 */
export function isDraftStale(draft: ISetupDraft, solution: ISolutionDefinition): boolean {
  return draft.solution_version !== solution.version;
}

/**
 * Structural validation of one definition. Returns human-readable problems
 * (empty = valid) so a bad definition fails loudly at the seam instead of
 * rendering a broken chooser card.
 */
export function validateSolutionDefinition(solution: ISolutionDefinition): string[] {
  const problems: string[] = [];

  if (!isSolutionKey(solution.key)) problems.push(`Unknown solution key "${solution.key}".`);
  if (!Number.isInteger(solution.version) || solution.version < 1) {
    problems.push(`Solution "${solution.key}" needs an integer version >= 1.`);
  }
  for (const field of ["name", "outcome", "container_noun"] as const) {
    if (!solution[field]?.trim()) problems.push(`Solution "${solution.key}" is missing ${field}.`);
  }
  for (const capability of solution.capabilities) {
    if (!CAPABILITIES.has(capability)) {
      problems.push(`Solution "${solution.key}" declares unknown capability "${capability}".`);
    }
  }
  if (availableStartingPoints(solution).length === 0) {
    problems.push(
      `Solution "${solution.key}" has no startable entry point — every capability-gated starting point is unsupported.`,
    );
  }
  if (
    solution.availability !== ESolutionAvailability.Available &&
    !solution.availability_reason?.trim()
  ) {
    problems.push(
      `Solution "${solution.key}" is ${solution.availability} but gives no availability_reason to show the user.`,
    );
  }
  problems.push(...duplicateKeyProblems(solution));

  return problems;
}

function duplicateKeyProblems(solution: ISolutionDefinition): string[] {
  const problems: string[] = [];
  const seenStartingPoints = new Set<string>();
  for (const point of solution.starting_points) {
    if (seenStartingPoints.has(point.key)) {
      problems.push(`Solution "${solution.key}" repeats starting point "${point.key}".`);
    }
    seenStartingPoints.add(point.key);
  }
  const seenNav = new Set<string>();
  for (const entry of solution.navigation) {
    if (seenNav.has(entry.key)) {
      problems.push(`Solution "${solution.key}" repeats navigation entry "${entry.key}".`);
    }
    seenNav.add(entry.key);
  }
  return problems;
}

/** Validate a whole registry, including cross-definition uniqueness. */
export function validateSolutionRegistry(registry: ISolutionRegistry): string[] {
  const problems = registry.solutions.flatMap(validateSolutionDefinition);
  if (!registry.revision?.trim()) {
    problems.push("Registry is missing a revision, so caches cannot be invalidated safely.");
  }
  const seen = new Set<string>();
  for (const solution of registry.solutions) {
    if (seen.has(solution.key)) problems.push(`Registry defines "${solution.key}" more than once.`);
    seen.add(solution.key);
  }
  return problems;
}
