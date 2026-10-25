import type { IBlueprintDefinition } from "@/types/solution/blueprint";
import type { IConnectorManifest } from "@/types/solution/connector";
import {
  EPlanGroup,
  EPlanItemState,
  type IInstallPlan,
  type IPlanCounts,
  type IPlanItem,
  type IPlanWarning,
} from "@/types/solution/install-plan";

import { digestBlueprint } from "../blueprint/digest";

/**
 * Install-plan materialization (GIN-452).
 *
 * Pure and side-effect free — materializing a plan performs no writes, so the
 * preview can be recomputed on every parameter keystroke. The installer
 * (GIN-453) is the only thing that turns a plan into real objects.
 */

export interface IMaterializeContext {
  workspace_slug: string;
  setup_draft_id: string;
  /** Connector manifests actually available to this workspace. */
  connectors: IConnectorManifest[];
  /** Skill profile refs the platform can currently provide. */
  available_skill_refs: string[];
  /** Values the user decided during intake. */
  decided_parameters: Record<string, unknown>;
  /** Values from approved inference (GIN-448/449). */
  inferred_parameters: Record<string, unknown>;
}

/** Plan-level warning codes that hold back installation. */
const BLOCKING_WARNINGS: ReadonlySet<string> = new Set(["parameter_required"]);

function itemKey(group: EPlanGroup, key: string): string {
  return `${group}:${key}`;
}

export interface IResolvedParameters {
  values: Record<string, unknown>;
  /** Parameter key → where the value came from. */
  provenance: Record<string, string>;
  warnings: IPlanWarning[];
}

/** User decisions win over inference, which wins over the blueprint default. */
export function resolveParameters(
  definition: IBlueprintDefinition,
  context: IMaterializeContext,
): IResolvedParameters {
  const values: Record<string, unknown> = {};
  const provenance: Record<string, string> = {};
  const warnings: IPlanWarning[] = [];

  for (const parameter of definition.parameters) {
    if (parameter.key in context.decided_parameters) {
      values[parameter.key] = context.decided_parameters[parameter.key];
      provenance[parameter.key] = "your answer during setup";
    } else if (parameter.key in context.inferred_parameters) {
      values[parameter.key] = context.inferred_parameters[parameter.key];
      provenance[parameter.key] = "approved inference";
    } else if (parameter.default !== null && parameter.default !== undefined) {
      values[parameter.key] = parameter.default;
      provenance[parameter.key] = "blueprint default";
    } else if (parameter.required) {
      warnings.push({
        code: "parameter_required",
        message: `"${parameter.label}" has no value yet.`,
        remediation: `Answer "${parameter.label}" before installing.`,
      });
    }
  }

  return { values, provenance, warnings };
}

function makeItem(
  definition: IBlueprintDefinition,
  group: EPlanGroup,
  key: string,
  label: string,
  options: Partial<Pick<IPlanItem, "required" | "depends_on" | "provenance">> = {},
): IPlanItem {
  return {
    key: itemKey(group, key),
    group,
    label,
    source_blueprint_key: definition.identity.key,
    source_blueprint_version: definition.identity.version,
    required: options.required ?? true,
    state: EPlanItemState.Selected,
    depends_on: options.depends_on ?? [],
    provenance: options.provenance ?? `${definition.identity.name} blueprint`,
    warnings: [],
    blockers: [],
  };
}

function integrationItems(
  definition: IBlueprintDefinition,
  context: IMaterializeContext,
): IPlanItem[] {
  return definition.integrations.map((ref) => {
    const manifest = context.connectors.find((c) => c.key === ref.connector_key);
    const item = makeItem(
      definition,
      EPlanGroup.Integrations,
      ref.connector_key,
      manifest?.name ?? ref.connector_key,
    );

    if (!manifest) {
      item.state = EPlanItemState.Blocked;
      item.blockers.push({
        code: "connector_unavailable",
        message: `The "${ref.connector_key}" integration is not available in this workspace.`,
        remediation: "Ask a workspace admin to enable it, or choose another blueprint.",
      });
      return item;
    }

    const known = new Set(manifest.capabilities.map((c) => c.key));
    const missing = ref.capabilities.filter((c) => !known.has(c));
    if (missing.length > 0) {
      item.state = EPlanItemState.Blocked;
      item.blockers.push({
        code: "capability_unsupported",
        message: `${manifest.name} cannot provide: ${missing.join(", ")}.`,
        remediation: "Pick a blueprint that does not need these capabilities.",
      });
    }

    return item;
  });
}

function agentItems(
  definition: IBlueprintDefinition,
  context: IMaterializeContext,
): IPlanItem[] {
  return definition.agent_roles.map((role) => {
    const item = makeItem(definition, EPlanGroup.Agents, role.key, role.label);
    if (role.skill_profile_ref && !context.available_skill_refs.includes(role.skill_profile_ref)) {
      item.state = EPlanItemState.Blocked;
      item.blockers.push({
        code: "skill_unavailable",
        message: `The "${role.skill_profile_ref}" skill profile is not installed.`,
        remediation: "Install the skill profile, or remove this agent role from the plan.",
      });
    }
    return item;
  });
}

export function computeCounts(items: IPlanItem[]): IPlanCounts {
  const by_group: Record<string, number> = {};
  for (const item of items) {
    by_group[item.group] = (by_group[item.group] ?? 0) + 1;
  }
  return {
    total: items.length,
    selected: items.filter((i) => i.state === EPlanItemState.Selected).length,
    deselected: items.filter((i) => i.state === EPlanItemState.Deselected).length,
    waived: items.filter((i) => i.state === EPlanItemState.Waived).length,
    blocked: items.filter((i) => i.state === EPlanItemState.Blocked).length,
    by_group,
  };
}

function isInstallable(items: IPlanItem[], warnings: IPlanWarning[]): boolean {
  if (items.some((i) => i.state === EPlanItemState.Blocked)) return false;
  return !warnings.some((w) => BLOCKING_WARNINGS.has(w.code));
}

/** Turn a blueprint definition plus resolved evidence into an editable plan. */
export function materializePlan(
  definition: IBlueprintDefinition,
  context: IMaterializeContext,
): IInstallPlan {
  const resolved = resolveParameters(definition, context);

  const items: IPlanItem[] = [
    ...(definition.journey_ref
      ? [
          makeItem(
            definition,
            EPlanGroup.Journey,
            definition.journey_ref,
            `${definition.journey_ref} journey`,
          ),
        ]
      : []),
    ...definition.domains.map((d) =>
      makeItem(definition, EPlanGroup.Structure, d.key, d.label),
    ),
    ...definition.work_graph.map((w) =>
      makeItem(definition, EPlanGroup.Work, w.key, w.label, {
        depends_on: w.depends_on.map((dep) => itemKey(EPlanGroup.Work, dep)),
      }),
    ),
    ...agentItems(definition, context),
    ...integrationItems(definition, context),
    ...definition.approvals.map((a) =>
      makeItem(definition, EPlanGroup.Approvals, a.key, a.label, { required: a.required }),
    ),
    ...definition.views.map((v) =>
      makeItem(definition, EPlanGroup.Views, v.key, v.label, { required: false }),
    ),
    ...definition.documents.map((d) =>
      makeItem(definition, EPlanGroup.Documents, d.key, d.title, { required: false }),
    ),
  ];

  return {
    id: `plan.${context.setup_draft_id}.${definition.identity.key}.v${definition.identity.version}`,
    workspace_slug: context.workspace_slug,
    setup_draft_id: context.setup_draft_id,
    solution_key: definition.identity.solution_key,
    blueprint_key: definition.identity.key,
    blueprint_version: definition.identity.version,
    blueprint_digest: digestBlueprint(definition),
    parameters: resolved.values,
    items,
    counts: computeCounts(items),
    warnings: resolved.warnings,
    installable: isInstallable(items, resolved.warnings),
    created_at: new Date().toISOString(),
  };
}

function withItems(plan: IInstallPlan, items: IPlanItem[]): IInstallPlan {
  return {
    ...plan,
    items,
    counts: computeCounts(items),
    installable: isInstallable(items, plan.warnings),
  };
}

/** Turn an optional item off. Required items must be waived instead. */
export function deselectItem(plan: IInstallPlan, key: string): IInstallPlan {
  const target = plan.items.find((i) => i.key === key);
  if (!target) throw new Error(`Unknown plan item "${key}".`);
  if (target.required) {
    throw new Error(`"${target.label}" is required — waive it with a reason instead.`);
  }

  const dependents = plan.items.filter(
    (i) => i.depends_on.includes(key) && i.state === EPlanItemState.Selected,
  );

  const items = plan.items.map((item) => {
    if (item.key === key) {
      return { ...item, state: EPlanItemState.Deselected, warnings: [] };
    }
    if (!dependents.includes(item)) return item;
    return {
      ...item,
      warnings: [
        ...item.warnings,
        {
          code: "dependency_deselected",
          message: `Depends on "${target.label}", which you turned off.`,
          remediation: `Turn "${target.label}" back on, or remove this entry too.`,
        },
      ],
    };
  });

  return withItems(plan, items);
}

export function reselectItem(plan: IInstallPlan, key: string): IInstallPlan {
  const items = plan.items.map((item) => {
    if (item.key === key) return { ...item, state: EPlanItemState.Selected };
    return {
      ...item,
      warnings: item.warnings.filter(
        (w) => !(w.code === "dependency_deselected" && item.depends_on.includes(key)),
      ),
    };
  });
  return withItems(plan, items);
}

/** Skip a required item with an explicit rationale. Blocked items cannot be waived. */
export function waiveItem(
  plan: IInstallPlan,
  key: string,
  rationale: string,
): IInstallPlan {
  const target = plan.items.find((i) => i.key === key);
  if (!target) throw new Error(`Unknown plan item "${key}".`);
  if (target.state === EPlanItemState.Blocked) {
    throw new Error(`"${target.label}" is blocked and cannot be waived.`);
  }
  if (!rationale.trim()) {
    throw new Error("A waiver needs a reason.");
  }

  const items = plan.items.map((item) =>
    item.key === key
      ? {
          ...item,
          state: EPlanItemState.Waived,
          provenance: `${item.provenance} — waived: ${rationale.trim()}`,
        }
      : item,
  );
  return withItems(plan, items);
}

export interface IPlanEdit {
  state: EPlanItemState.Deselected | EPlanItemState.Waived;
  rationale?: string;
}

/**
 * Replay user edits onto a freshly materialized plan. Lets the preview be
 * derived during render — a parameter change re-materializes and the edits
 * still apply. Edits that no longer make sense (the item vanished, or is now
 * blocked) are dropped rather than throwing mid-render.
 */
export function applyEdits(
  plan: IInstallPlan,
  edits: Record<string, IPlanEdit>,
): IInstallPlan {
  let next = plan;
  for (const [key, edit] of Object.entries(edits)) {
    try {
      next =
        edit.state === EPlanItemState.Waived
          ? waiveItem(next, key, edit.rationale ?? "")
          : deselectItem(next, key);
    } catch {
      continue;
    }
  }
  return next;
}

/** Grouped preview, ordered the same way every time. */
export function groupPlan(plan: IInstallPlan): { group: EPlanGroup; items: IPlanItem[] }[] {
  const order = Object.values(EPlanGroup);
  return order
    .map((group) => ({ group, items: plan.items.filter((i) => i.group === group) }))
    .filter((entry) => entry.items.length > 0);
}
