import { APIError } from "@/services/api-error";
import type { ITriageItem } from "@/types";
import { ETriageSource, ETriageStatus } from "@/types";
import { EStoryPriority } from "@/types/story/story";

import { customers, triageItems } from "../data/intake";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

const PRIORITY_RANK: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};
const RANK_PRIORITY = ["none", "low", "medium", "high", "urgent"] as EStoryPriority[];
// Customer priority_weight (0..3) → a floor the request can't fall below (mirrors engine._WEIGHT_FLOOR).
const WEIGHT_FLOOR = ["none", "medium", "high", "urgent"];

/** Keyword classifier mirroring the backend's classify() shape (domain/task_type). */
export function classifyTriage(text: string): { domain: string; task_type: string } {
  const t = text.toLowerCase();
  let task_type = "story";
  if (/\b(bug|fail|error|crash|broken|overlap|misalign)/.test(t)) task_type = "bug";
  else if (/\b(add|support|export|toggle|feature|enable)/.test(t)) task_type = "feature";
  else if (/\b(design|layout|align|theme|ui|ux)/.test(t)) task_type = "design";
  return { domain: "general", task_type };
}

/** priority = higher of keyword-assessed impact and the customer-weight floor. */
export function combineTriagePriority(text: string, customerWeight: number): EStoryPriority {
  const t = text.toLowerCase();
  const impact = /\b(urgent|crash|double-charge|outage|security)/.test(t)
    ? "urgent"
    : /\b(fail|error|payment|charge)/.test(t)
      ? "high"
      : "medium";
  const floor = WEIGHT_FLOOR[customerWeight] ?? "none";
  const rank = Math.max(PRIORITY_RANK[impact] ?? 0, PRIORITY_RANK[floor] ?? 0);
  return RANK_PRIORITY[rank];
}

const TYPE_PERSONA: Record<string, [string, string]> = {
  bug: ["agent_dev", "James (Developer)"],
  feature: ["agent_dev", "James (Developer)"],
  design: ["agent_ux", "Sally (UX)"],
  test: ["agent_qa", "Quinn (QA)"],
};

function findItem(slug: string, id: string): ITriageItem {
  const item = triageItems.find((i) => i.workspace_slug === slug && i.id === id);
  if (!item) throw new APIError(404, "Triage item not found");
  return item;
}

let triSeq = triageItems.length;
let custSeq = customers.length;

/** Smart Intake triage queue + customers (GIN-213/214/215). Mirrors the Python
 * intake router below the service boundary so the queue works with no backend. */
export function makeIntakeHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/triage\/$/,
      resolve: ([, slug]) =>
        clone(
          triageItems
            .filter(
              (i) =>
                i.workspace_slug === slug &&
                (i.status === ETriageStatus.New || i.status === ETriageStatus.Triaged),
            )
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
        ),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/triage\/$/,
      resolve: ([, slug], body) => {
        const b = (body ?? {}) as {
          title: string;
          body?: string;
          source?: ITriageItem["source"];
          is_public?: boolean;
          project_id?: string | null;
          customer_id?: string | null;
        };
        if (!b.title?.trim()) throw new APIError(400, "A title is required");
        const now = new Date().toISOString();
        const item: ITriageItem = {
          id: `tri_${++triSeq}`,
          workspace_slug: slug,
          project_id: b.project_id ?? null,
          source: b.source ?? ("personal" as ITriageItem["source"]),
          is_public: b.is_public ?? false,
          status: ETriageStatus.New,
          title: b.title.trim().slice(0, 300),
          body: b.body ?? "",
          customer_id: b.customer_id ?? null,
          classification: {},
          enriched_title: null,
          enriched_description: null,
          priority: null,
          duplicate_ids: [],
          recommended_route: {},
          created_story_id: null,
          created_at: now,
          updated_at: now,
        };
        triageItems.unshift(item);
        return clone(item);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/triage\/([^/]+)\/process\/$/,
      resolve: ([, slug, id]) => {
        const item = findItem(slug, id);
        const text = `${item.title}\n${item.body}`;
        const classification = classifyTriage(text);
        const weight =
          customers.find((c) => c.id === item.customer_id)?.priority_weight ?? 0;
        const [persona_id, persona_name] =
          TYPE_PERSONA[classification.task_type] ?? ["agent_dev", "James (Developer)"];
        item.classification = classification;
        item.enriched_title = item.enriched_title ?? item.title.slice(0, 120);
        item.enriched_description =
          item.enriched_description ?? `<p>${item.body || item.title}</p>`;
        item.priority = combineTriagePriority(text, weight);
        item.recommended_route = {
          domain: classification.domain,
          task_type: classification.task_type,
          persona_id,
          persona_name,
          skills: classification.task_type === "bug" ? ["skill:testing-tdd"] : [],
          confidence: weight >= 2 ? "high" : "medium",
          rationale: `Classified as ${classification.domain} / ${classification.task_type}; routed to ${persona_name}.`,
          route: "persona",
        };
        item.status = ETriageStatus.Triaged;
        item.updated_at = new Date().toISOString();
        return clone(item);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/triage\/([^/]+)\/accept\/$/,
      resolve: ([, slug, id], body) => {
        const item = findItem(slug, id);
        if (item.status === ETriageStatus.Accepted) {
          throw new APIError(409, "Already accepted");
        }
        const b = (body ?? {}) as {
          project_id?: string | null;
          title?: string;
          description?: string;
        };
        const projectId = b.project_id ?? item.project_id;
        if (!projectId) throw new APIError(400, "A target project is required to accept");
        // ponytail: edited draft applied here; deployed accept ignores these keys —
        // one backend line makes it honor them (see IAcceptTriagePayload).
        if (b.title) item.enriched_title = b.title.slice(0, 300);
        if (b.description) item.enriched_description = b.description;
        item.project_id = projectId;
        item.status = ETriageStatus.Accepted;
        item.created_story_id = `st_from_${item.id}`;
        item.updated_at = new Date().toISOString();
        return clone(item);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/triage\/([^/]+)\/dismiss\/$/,
      resolve: ([, slug, id]) => {
        const item = findItem(slug, id);
        item.status = ETriageStatus.Dismissed;
        item.updated_at = new Date().toISOString();
        return clone(item);
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/customers\/$/,
      resolve: () => clone([...customers].sort((a, b) => a.name.localeCompare(b.name))),
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/intake-link\/$/,
      resolve: ([, slug]) => {
        const token = `intake-${slug}`;
        return { token, url: `/intake/${token}` };
      },
    },
    {
      // Unauthenticated public form. Workspace comes from the token (mock: the
      // slug is encoded as `intake-<slug>`), never a client-supplied id.
      method: "POST",
      pattern: /^\/public\/intake\/([^/]+)\/$/,
      resolve: ([, token], body) => {
        const slug = token.startsWith("intake-") ? token.slice("intake-".length) : "";
        if (!slug) throw new APIError(404, "Invalid or expired intake link");
        const b = (body ?? {}) as { title?: string; body?: string; email?: string | null };
        if (!b.title?.trim()) throw new APIError(400, "A title is required");
        const now = new Date().toISOString();
        const detail = b.email ? `From: ${b.email}\n\n${b.body ?? ""}` : (b.body ?? "");
        triageItems.unshift({
          id: `tri_${++triSeq}`,
          workspace_slug: slug,
          project_id: null,
          source: ETriageSource.PublicForm,
          is_public: true,
          status: ETriageStatus.New,
          title: b.title.trim().slice(0, 300),
          body: detail,
          customer_id: null,
          classification: {},
          enriched_title: null,
          enriched_description: null,
          priority: null,
          duplicate_ids: [],
          recommended_route: {},
          created_story_id: null,
          created_at: now,
          updated_at: now,
        });
        return { received: true };
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/customers\/$/,
      resolve: (_m, body) => {
        const b = (body ?? {}) as {
          name: string;
          email?: string | null;
          priority_weight?: number;
          notes?: string | null;
        };
        if (!b.name?.trim()) throw new APIError(400, "A name is required");
        const created = {
          id: `cust_${++custSeq}`,
          name: b.name.trim(),
          email: b.email ?? null,
          priority_weight: b.priority_weight ?? 0,
          notes: b.notes ?? null,
          created_at: new Date().toISOString(),
        };
        customers.push(created);
        return clone(created);
      },
    },
  ];
}
