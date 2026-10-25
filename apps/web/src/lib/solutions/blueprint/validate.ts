import {
  EBlueprintLifecycle,
  type IBlueprintDefinition,
  type IBlueprintValidationIssue,
  type IBlueprintValidationResult,
} from "@/types/solution/blueprint";

import { digestBlueprint } from "./digest";

const CREDENTIAL_KEY =
  /^(.*_)?(password|secret|token|api[_-]?key|oauth|credential|private[_-]?key)(_.*)?$/i;

function push(
  issues: IBlueprintValidationIssue[],
  path: string,
  code: string,
  message: string,
) {
  issues.push({ path, code, message });
}

function walkForSecrets(value: unknown, path: string, issues: IBlueprintValidationIssue[]) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkForSecrets(item, `${path}[${i}]`, issues));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (CREDENTIAL_KEY.test(key)) {
      push(
        issues,
        childPath,
        "forbidden_credential",
        `Blueprint definitions must not contain credential field "${key}".`,
      );
    }
    walkForSecrets(child, childPath, issues);
  }
}

function detectWorkCycles(definition: IBlueprintDefinition, issues: IBlueprintValidationIssue[]) {
  const nodes = new Map(definition.work_graph.map((n) => [n.key, n]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(key: string, stack: string[]) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      push(
        issues,
        `work_graph.${key}`,
        "circular_dependency",
        `Circular work dependency: ${[...stack, key].join(" → ")}.`,
      );
      return;
    }
    const node = nodes.get(key);
    if (!node) {
      push(issues, `work_graph.${key}`, "unknown_ref", `Unknown work node "${key}".`);
      return;
    }
    visiting.add(key);
    for (const dep of node.depends_on) {
      dfs(dep, [...stack, key]);
    }
    visiting.delete(key);
    visited.add(key);
  }

  for (const node of definition.work_graph) {
    for (const dep of node.depends_on) {
      if (!nodes.has(dep)) {
        push(
          issues,
          `work_graph.${node.key}.depends_on`,
          "unknown_ref",
          `Work node "${node.key}" depends on unknown "${dep}".`,
        );
      }
    }
    dfs(node.key, []);
  }
}

function uniqueKeys(
  items: { key: string }[],
  path: string,
  issues: IBlueprintValidationIssue[],
) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.key)) {
      push(issues, `${path}.${item.key}`, "duplicate_key", `Duplicate logical key "${item.key}".`);
    }
    seen.add(item.key);
  }
}

/**
 * Validate a blueprint definition. Returns a digest only when `ok`.
 * Revoked blueprints validate structurally but callers must refuse new installs
 * via {@link canStartInstall}.
 */
export function validateBlueprint(definition: IBlueprintDefinition): IBlueprintValidationResult {
  const issues: IBlueprintValidationIssue[] = [];

  if (!definition.identity.key.trim()) {
    push(issues, "identity.key", "required", "Blueprint key is required.");
  }
  if (definition.identity.version < 1) {
    push(issues, "identity.version", "invalid", "Blueprint version must be >= 1.");
  }

  uniqueKeys(definition.parameters, "parameters", issues);
  uniqueKeys(definition.domains, "domains", issues);
  uniqueKeys(definition.views, "views", issues);
  uniqueKeys(definition.documents, "documents", issues);
  uniqueKeys(definition.milestones, "milestones", issues);
  uniqueKeys(definition.work_graph, "work_graph", issues);
  uniqueKeys(definition.agent_roles, "agent_roles", issues);
  uniqueKeys(definition.approvals, "approvals", issues);
  uniqueKeys(definition.dashboards, "dashboards", issues);
  uniqueKeys(definition.success_measures, "success_measures", issues);

  for (const param of definition.parameters) {
    if (CREDENTIAL_KEY.test(param.key)) {
      push(
        issues,
        `parameters.${param.key}`,
        "forbidden_credential",
        `Parameter key "${param.key}" looks like a credential and is not allowed.`,
      );
    }
  }

  detectWorkCycles(definition, issues);
  walkForSecrets(definition, "", issues);

  for (const integration of definition.integrations) {
    if (!integration.connector_key.trim()) {
      push(issues, "integrations", "unknown_ref", "Integration is missing connector_key.");
    }
    if (integration.capabilities.length === 0) {
      push(
        issues,
        `integrations.${integration.connector_key}`,
        "required",
        "Integration must declare at least one capability.",
      );
    }
  }

  const ok = issues.length === 0;
  return {
    ok,
    digest: ok ? digestBlueprint(definition) : null,
    issues,
  };
}

/** Revoked blueprints cannot start new installs; existing installs keep their digest. */
export function canStartInstall(definition: IBlueprintDefinition): boolean {
  if (definition.lifecycle === EBlueprintLifecycle.Revoked) return false;
  if (definition.lifecycle === EBlueprintLifecycle.Draft) return false;
  return validateBlueprint(definition).ok;
}
