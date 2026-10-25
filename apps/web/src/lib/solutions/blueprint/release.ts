import {
  EBlueprintLifecycle,
  type IBlueprintDefinition,
  type IBlueprintValidationIssue,
} from "@/types/solution/blueprint";
import {
  EBlueprintAuditAction,
  EBlueprintRole,
  type IBlueprintActor,
  type IBlueprintAuditEntry,
  type IBlueprintCompatibility,
  type IBlueprintImpact,
  type IBlueprintInstallation,
  type IBlueprintValidationReport,
} from "@/types/solution/blueprint-release";
import type { ESolutionCapability } from "@/types/solution/solution";
import type { IConnectorManifest } from "@/types/solution/connector";
import type { IInstallPlan } from "@/types/solution/install-plan";

import { materializePlan } from "../plan/materialize";
import { digestBlueprint } from "./digest";
import { validateBlueprint } from "./validate";

/**
 * Blueprint release workflow (GIN-454).
 *
 * Lifecycle is a permissioned state machine. `Approved` is the released state
 * and is immutable — `editReleased` forks the next draft instead of mutating
 * it, so an install's pinned version/digest can never change underneath it.
 */

/** Legal lifecycle moves and the role each one requires. */
const TRANSITIONS: Record<EBlueprintLifecycle, Partial<Record<EBlueprintLifecycle, EBlueprintRole>>> =
  {
    [EBlueprintLifecycle.Draft]: {
      [EBlueprintLifecycle.Validated]: EBlueprintRole.Author,
    },
    [EBlueprintLifecycle.Validated]: {
      [EBlueprintLifecycle.Draft]: EBlueprintRole.Author,
      [EBlueprintLifecycle.Approved]: EBlueprintRole.Publisher,
    },
    [EBlueprintLifecycle.Approved]: {
      [EBlueprintLifecycle.Deprecated]: EBlueprintRole.Publisher,
      [EBlueprintLifecycle.Revoked]: EBlueprintRole.Publisher,
    },
    [EBlueprintLifecycle.Deprecated]: {
      [EBlueprintLifecycle.Approved]: EBlueprintRole.Publisher,
      [EBlueprintLifecycle.Revoked]: EBlueprintRole.Publisher,
    },
    [EBlueprintLifecycle.Revoked]: {},
  };

const AUDIT_FOR_TRANSITION: Partial<Record<EBlueprintLifecycle, EBlueprintAuditAction>> = {
  [EBlueprintLifecycle.Validated]: EBlueprintAuditAction.Validated,
  [EBlueprintLifecycle.Draft]: EBlueprintAuditAction.ReturnedToDraft,
  [EBlueprintLifecycle.Approved]: EBlueprintAuditAction.Published,
  [EBlueprintLifecycle.Deprecated]: EBlueprintAuditAction.Deprecated,
  [EBlueprintLifecycle.Revoked]: EBlueprintAuditAction.Revoked,
};

/** Lifecycles whose definition can never be edited in place. */
const IMMUTABLE: ReadonlySet<EBlueprintLifecycle> = new Set([
  EBlueprintLifecycle.Approved,
  EBlueprintLifecycle.Deprecated,
  EBlueprintLifecycle.Revoked,
]);

export function isReleased(definition: IBlueprintDefinition): boolean {
  return IMMUTABLE.has(definition.lifecycle);
}

function hasRole(actor: IBlueprintActor, role: EBlueprintRole): boolean {
  return actor.roles.includes(role);
}

/** Why a transition is refused, or null when the actor may perform it. */
export function transitionBlockedReason(
  definition: IBlueprintDefinition,
  to: EBlueprintLifecycle,
  actor: IBlueprintActor,
): string | null {
  const required = TRANSITIONS[definition.lifecycle][to];
  if (!required) {
    return `A ${definition.lifecycle} blueprint cannot move to ${to}.`;
  }
  if (!hasRole(actor, required)) {
    return `Only a ${required} can do that.`;
  }
  return null;
}

let auditSeq = 0;

function audit(
  definition: IBlueprintDefinition,
  action: EBlueprintAuditAction,
  actorId: string,
  detail: string,
): IBlueprintAuditEntry {
  auditSeq += 1;
  return {
    id: `bp-audit-${auditSeq}`,
    blueprint_key: definition.identity.key,
    blueprint_version: definition.identity.version,
    action,
    actor_id: actorId,
    at: new Date().toISOString(),
    digest: digestBlueprint(definition),
    detail,
  };
}

export interface ITransitionResult {
  definition: IBlueprintDefinition;
  entry: IBlueprintAuditEntry;
}

/** Move a blueprint through the lifecycle, recording an audit entry. */
export function transitionBlueprint(
  definition: IBlueprintDefinition,
  to: EBlueprintLifecycle,
  actor: IBlueprintActor,
): ITransitionResult {
  const blocked = transitionBlockedReason(definition, to, actor);
  if (blocked) throw new Error(blocked);

  const next = { ...definition, lifecycle: to };
  const action = AUDIT_FOR_TRANSITION[to] ?? EBlueprintAuditAction.DraftEdited;

  return {
    definition: next,
    entry: audit(next, action, actor.id, `${definition.lifecycle} → ${to}.`),
  };
}

/** Edit a draft in place. Refuses on anything already released. */
export function editDraft(
  definition: IBlueprintDefinition,
  changes: Partial<IBlueprintDefinition>,
  actor: IBlueprintActor,
): ITransitionResult {
  if (isReleased(definition)) {
    throw new Error(
      `Version ${definition.identity.version} is released and immutable — fork a new version instead.`,
    );
  }
  if (!hasRole(actor, EBlueprintRole.Author)) {
    throw new Error("Only an author can edit a blueprint.");
  }

  const next: IBlueprintDefinition = {
    ...definition,
    ...changes,
    identity: { ...definition.identity, ...(changes.identity ?? {}) },
    lifecycle: EBlueprintLifecycle.Draft,
  };

  return {
    definition: next,
    entry: audit(next, EBlueprintAuditAction.DraftEdited, actor.id, "Draft updated."),
  };
}

/** Fork the next draft version from a released definition. */
export function editReleased(
  definition: IBlueprintDefinition,
  changes: Partial<IBlueprintDefinition>,
  actor: IBlueprintActor,
): ITransitionResult {
  if (!isReleased(definition)) {
    throw new Error("That version is not released — edit it directly.");
  }
  if (!hasRole(actor, EBlueprintRole.Author)) {
    throw new Error("Only an author can edit a blueprint.");
  }

  const next: IBlueprintDefinition = {
    ...definition,
    ...changes,
    identity: {
      ...definition.identity,
      ...(changes.identity ?? {}),
      key: definition.identity.key,
      version: definition.identity.version + 1,
    },
    lifecycle: EBlueprintLifecycle.Draft,
  };

  return {
    definition: next,
    entry: audit(
      next,
      EBlueprintAuditAction.DraftEdited,
      actor.id,
      `Forked v${next.identity.version} from released v${definition.identity.version}.`,
    ),
  };
}

/** Copy a definition under a new key as a fresh v1 draft. */
export function cloneBlueprint(
  definition: IBlueprintDefinition,
  newKey: string,
  newName: string,
  actor: IBlueprintActor,
): ITransitionResult {
  if (!hasRole(actor, EBlueprintRole.Author)) {
    throw new Error("Only an author can clone a blueprint.");
  }

  const next: IBlueprintDefinition = {
    ...definition,
    identity: { ...definition.identity, key: newKey, version: 1, name: newName },
    lifecycle: EBlueprintLifecycle.Draft,
  };

  return {
    definition: next,
    entry: audit(
      next,
      EBlueprintAuditAction.Cloned,
      actor.id,
      `Cloned from ${definition.identity.key} v${definition.identity.version}.`,
    ),
  };
}

export interface ICompatibilityInput {
  connectors: IConnectorManifest[];
  available_skill_refs: string[];
  solution_capabilities: ESolutionCapability[];
  /** Solution capabilities each blueprint feature needs, keyed by feature. */
  required_solution_capabilities?: ESolutionCapability[];
}

export function checkCompatibility(
  definition: IBlueprintDefinition,
  input: ICompatibilityInput,
): IBlueprintCompatibility {
  const missing_connectors: string[] = [];
  const missing_capabilities: Record<string, string[]> = {};

  for (const ref of definition.integrations) {
    const manifest = input.connectors.find((c) => c.key === ref.connector_key);
    if (!manifest) {
      missing_connectors.push(ref.connector_key);
      continue;
    }
    const known = new Set(manifest.capabilities.map((c) => c.key));
    const missing = ref.capabilities.filter((c) => !known.has(c));
    if (missing.length > 0) missing_capabilities[ref.connector_key] = missing;
  }

  const missing_skills = definition.agent_roles
    .map((role) => role.skill_profile_ref)
    .filter((ref): ref is string => ref !== null && !input.available_skill_refs.includes(ref));

  const missing_solution_capabilities = (input.required_solution_capabilities ?? []).filter(
    (capability) => !input.solution_capabilities.includes(capability),
  );

  return {
    missing_connectors,
    missing_capabilities,
    missing_skills,
    missing_solution_capabilities,
    compatible:
      missing_connectors.length === 0 &&
      Object.keys(missing_capabilities).length === 0 &&
      missing_skills.length === 0 &&
      missing_solution_capabilities.length === 0,
  };
}

function compatibilityIssues(
  compatibility: IBlueprintCompatibility,
): IBlueprintValidationIssue[] {
  const issues: IBlueprintValidationIssue[] = [];

  for (const key of compatibility.missing_connectors) {
    issues.push({
      path: `integrations.${key}`,
      code: "connector_missing",
      message: `No connector named "${key}" is available.`,
    });
  }
  for (const [key, capabilities] of Object.entries(compatibility.missing_capabilities)) {
    issues.push({
      path: `integrations.${key}`,
      code: "connector_scope_missing",
      message: `"${key}" cannot provide: ${capabilities.join(", ")}.`,
    });
  }
  for (const ref of compatibility.missing_skills) {
    issues.push({
      path: `agent_roles.${ref}`,
      code: "skill_missing",
      message: `Skill profile "${ref}" is not installed.`,
    });
  }
  for (const capability of compatibility.missing_solution_capabilities) {
    issues.push({
      path: `solution.${capability}`,
      code: "solution_capability_missing",
      message: `The solution does not support "${capability}".`,
    });
  }

  return issues;
}

/** Codes that are advisory rather than release-blocking. */
const WARNING_CODES: ReadonlySet<string> = new Set(["deprecated_field", "empty_work_graph"]);

/**
 * Full pre-release report: schema validation from GIN-451 plus platform
 * compatibility. Errors block release; warnings are shown but do not.
 */
export function validateForRelease(
  definition: IBlueprintDefinition,
  input: ICompatibilityInput,
): IBlueprintValidationReport {
  const schema = validateBlueprint(definition);
  const compatibility = checkCompatibility(definition, input);

  const all = [...schema.issues, ...compatibilityIssues(compatibility)];
  const errors = all.filter((issue) => !WARNING_CODES.has(issue.code));
  const warnings = all.filter((issue) => WARNING_CODES.has(issue.code));

  return {
    blueprint_key: definition.identity.key,
    blueprint_version: definition.identity.version,
    digest: schema.digest,
    errors,
    warnings,
    compatibility,
    releasable: errors.length === 0,
  };
}

/** A blueprint may only leave Draft once it validates cleanly. */
export function canSubmitForReview(
  definition: IBlueprintDefinition,
  report: IBlueprintValidationReport,
  actor: IBlueprintActor,
): boolean {
  if (!report.releasable) return false;
  return transitionBlockedReason(definition, EBlueprintLifecycle.Validated, actor) === null;
}

/** Synthetic context so a preview never touches a real workspace. */
export const PREVIEW_CONTEXT = {
  workspace_slug: "__preview__",
  setup_draft_id: "__preview__",
} as const;

/**
 * Materialize the definition against a synthetic fixture. Read-only: no
 * container, no writes, nothing persisted.
 */
export function previewInstall(
  definition: IBlueprintDefinition,
  input: ICompatibilityInput,
  parameters: Record<string, unknown> = {},
): IInstallPlan {
  return materializePlan(definition, {
    workspace_slug: PREVIEW_CONTEXT.workspace_slug,
    setup_draft_id: PREVIEW_CONTEXT.setup_draft_id,
    connectors: input.connectors,
    available_skill_refs: input.available_skill_refs,
    decided_parameters: parameters,
    inferred_parameters: {},
  });
}

const IMPACT_COPY: Partial<Record<EBlueprintLifecycle, string>> = {
  [EBlueprintLifecycle.Deprecated]:
    "Existing installations keep working, but the blueprint stops being recommended for new setups.",
  [EBlueprintLifecycle.Revoked]:
    "The blueprint can no longer be installed. Existing installations keep their pinned version and digest for audit.",
};

/** What deprecating or revoking would affect. Produced before confirmation. */
export function impactOf(
  definition: IBlueprintDefinition,
  to: EBlueprintLifecycle,
  installations: IBlueprintInstallation[],
): IBlueprintImpact {
  return {
    blueprint_key: definition.identity.key,
    from_lifecycle: definition.lifecycle,
    to_lifecycle: to,
    installations: installations.filter((i) => i.blueprint_version <= definition.identity.version),
    consequence: IMPACT_COPY[to] ?? `The blueprint moves to ${to}.`,
  };
}

/** Chronological audit trail for the blueprint detail view. */
export function releaseTimeline(entries: IBlueprintAuditEntry[]): IBlueprintAuditEntry[] {
  return [...entries].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
