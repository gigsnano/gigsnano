import { APIError } from "@/services/api-error";
import type { IAutomationAst, IAutomationRule, IAutomationRun } from "@/types";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Deterministic NL → AST compiler mirroring the backend's keyword compiler shape
 * (trigger + flat conditions + allowlisted actions; off-allowlist asks go to
 * `unsupported`, never dropped). ponytail: keyword heuristic, not an LLM.
 */
export function compileNl(text: string): IAutomationAst {
  const t = text.toLowerCase();

  const trigger: IAutomationAst["trigger"] = /\b(every|daily|weekly|schedule)\b/.test(t)
    ? "schedule"
    : /\b(updated|status|moved|transition)\b/.test(t)
      ? "story.updated"
      : "story.created";

  const conditions: IAutomationAst["conditions"] = [];
  if (/\bbug\b/.test(t)) conditions.push({ field: "type", op: "eq", value: "bug" });
  if (/\b(high|urgent) priority\b/.test(t) || /\burgent\b/.test(t))
    conditions.push({ field: "priority", op: "in", value: ["high", "urgent"] });

  const actions: IAutomationAst["actions"] = [];
  const unsupported: string[] = [];
  if (/\b(assign|route|persona|developer|engineer)\b/.test(t))
    actions.push({ type: "assign_persona", params: { persona_id: "agent_dev" } });
  if (/\bcomment\b/.test(t)) actions.push({ type: "comment", params: { body: "Auto-triaged." } });
  if (/\b(create|open) (a )?(sub-?task|work item|ticket)\b/.test(t))
    actions.push({ type: "create_work_item", params: { title: "Follow-up" } });
  if (/\bslack\b/.test(t)) unsupported.push("post to Slack (needs a threaded Slack sender)");
  if (/\b(notify|email|e-mail)\b/.test(t))
    unsupported.push("notify by email (needs a notification-template key)");

  return { trigger, conditions, actions, unsupported };
}

type MockAutomation = IAutomationRule & {
  _project: string;
  schedule?: { every: number; unit: string };
  next_run_at?: string | null;
};

const automations: MockAutomation[] = [
  {
    id: "auto_1",
    _project: "prj_mba",
    project_id: "prj_mba",
    name: "Triage new bugs",
    source_text: "When a bug is filed, assign the Developer persona.",
    trigger_event: "story.created",
    ast: compileNl("When a bug is filed, assign the Developer persona."),
    enabled: true,
    created_at: "2026-07-16T09:00:00Z",
  },
];

const runs: (IAutomationRun & { _project: string })[] = [
  {
    id: "run_1",
    _project: "prj_mba",
    automation_id: "auto_1",
    trigger_event: "story.created",
    story_id: "st_mba_5",
    dry_run: false,
    status: "success",
    actions_taken: [{ type: "assign_persona", persona_id: "agent_dev", ok: true }],
    created_at: "2026-07-17T11:00:00Z",
  },
  {
    id: "run_2",
    _project: "prj_mba",
    automation_id: "auto_1",
    trigger_event: "story.created",
    story_id: "st_mba_6",
    dry_run: false,
    status: "success",
    actions_taken: [{ type: "assign_persona", persona_id: "agent_dev", ok: true }],
    created_at: "2026-07-17T14:30:00Z",
  },
];

let aSeq = automations.length;
let rSeq = runs.length;

function ruleOut(r: MockAutomation): IAutomationRule {
  const { _project, schedule, next_run_at, ...wire } = r;
  void _project;
  void schedule;
  void next_run_at;
  return wire;
}

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

function recurrenceOut(r: MockAutomation) {
  const action = r.ast.actions[0];
  const template_id =
    action && typeof action.params.template_id === "string" ? action.params.template_id : null;
  return {
    id: r.id,
    name: r.name,
    template_id,
    every: r.schedule?.every ?? null,
    unit: r.schedule?.unit ?? null,
    next_run_at: r.next_run_at ?? null,
    enabled: r.enabled,
    created_at: r.created_at,
  };
}
function runOut(r: (typeof runs)[number]): IAutomationRun {
  const { _project, ...wire } = r;
  void _project;
  return wire;
}

function findRule(projectId: string, id: string) {
  const r = automations.find((a) => a._project === projectId && a.id === id);
  if (!r) throw new APIError(404, "Automation not found");
  return r;
}

export function makeAutomationHandlers(): Handler[] {
  const base = /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/automation-rules/;
  return [
    {
      method: "POST",
      pattern: new RegExp(`${base.source}/preview/$`),
      resolve: (_m, body) => clone(compileNl(((body ?? {}) as { text?: string }).text ?? "")),
    },
    {
      method: "GET",
      pattern: new RegExp(`${base.source}/$`),
      resolve: ([, , projectId]) =>
        clone(automations.filter((a) => a._project === projectId).map(ruleOut)),
    },
    {
      method: "POST",
      pattern: new RegExp(`${base.source}/$`),
      resolve: ([, , projectId], body) => {
        const b = (body ?? {}) as { name?: string; text?: string; enabled?: boolean };
        if (!b.name?.trim() || !b.text?.trim()) {
          throw new APIError(400, "name and text are required");
        }
        const ast = compileNl(b.text);
        const created = {
          id: `auto_${++aSeq}`,
          _project: projectId,
          project_id: projectId,
          name: b.name.trim(),
          source_text: b.text,
          trigger_event: ast.trigger,
          ast,
          enabled: b.enabled ?? true,
          created_at: new Date().toISOString(),
        };
        automations.push(created);
        return clone(ruleOut(created));
      },
    },
    {
      method: "PATCH",
      pattern: new RegExp(`${base.source}/([^/]+)/$`),
      resolve: ([, , projectId, id], body) => {
        const r = findRule(projectId, id);
        const b = (body ?? {}) as { name?: string; enabled?: boolean };
        if (b.name !== undefined) r.name = b.name.trim();
        if (b.enabled !== undefined) r.enabled = b.enabled;
        return clone(ruleOut(r));
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`${base.source}/([^/]+)/$`),
      resolve: ([, , projectId, id]) => {
        const i = automations.findIndex((a) => a._project === projectId && a.id === id);
        if (i === -1) throw new APIError(404, "Automation not found");
        automations.splice(i, 1);
        return { success: true };
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`${base.source}/([^/]+)/dry-run/$`),
      resolve: ([, , projectId, id]) => {
        const r = findRule(projectId, id);
        const taken = r.ast.actions.map((a) => ({ type: a.type, ok: true, dry_run: true }));
        const run = {
          id: `run_${++rSeq}`,
          _project: projectId,
          automation_id: r.id,
          trigger_event: r.trigger_event,
          story_id: null,
          dry_run: true,
          status: "dry_run",
          actions_taken: taken,
          created_at: new Date().toISOString(),
        };
        runs.unshift(run);
        return clone(runOut(run));
      },
    },
    // Recurrences (schedule automation rules). Pause/delete reuse the automation
    // PATCH/DELETE above, since a recurrence id IS an automation-rule id.
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/recurrences\/$/,
      resolve: ([, , projectId]) =>
        clone(
          automations
            .filter((a) => a._project === projectId && a.trigger_event === "schedule")
            .map(recurrenceOut),
        ),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/recurrences\/$/,
      resolve: ([, , projectId], body) => {
        const b = (body ?? {}) as { template_id?: string; every?: number; unit?: string };
        if (!b.template_id || !b.every || !b.unit) {
          throw new APIError(400, "template_id, every and unit are required");
        }
        const now = Date.now();
        const created: MockAutomation = {
          id: `auto_${++aSeq}`,
          _project: projectId,
          project_id: projectId,
          name: `Recurring: ${b.template_id}`,
          source_text: `every ${b.every} ${b.unit} from template ${b.template_id}`,
          trigger_event: "schedule",
          ast: {
            trigger: "schedule",
            conditions: [],
            actions: [{ type: "create_from_template", params: { template_id: b.template_id } }],
            unsupported: [],
          },
          schedule: { every: b.every, unit: b.unit },
          next_run_at: new Date(now + b.every * (UNIT_MS[b.unit] ?? UNIT_MS.days)).toISOString(),
          enabled: true,
          created_at: new Date(now).toISOString(),
        };
        automations.push(created);
        return clone(recurrenceOut(created));
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`${base.source}/([^/]+)/runs/$`),
      resolve: ([, , projectId, id]) => {
        findRule(projectId, id);
        return clone(
          runs
            .filter((r) => r._project === projectId && r.automation_id === id)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
            .map(runOut),
        );
      },
    },
  ];
}
