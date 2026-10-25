import { APIError } from "@/services/api-error";
import type { ITemplate } from "@/types";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown, query: URLSearchParams) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

interface IMockTemplate extends ITemplate {
  workspace_slug: string;
}

const templates: IMockTemplate[] = [
  {
    id: "tpl_saas", workspace_slug: "acme", workspace_id: "ws_1", kind: "project",
    name: "SaaS starter", visibility: "public", version: 1, created_at: "2026-07-05T09:00:00Z",
    content: { foundation_preset: "next-shadcn", sprints: ["Sprint-0"] },
  },
  {
    id: "tpl_client", workspace_slug: "acme", workspace_id: "ws_1", kind: "project",
    name: "Client site", visibility: "private", version: 2, created_at: "2026-07-06T09:00:00Z",
    content: { foundation_preset: "react-vite-tailwind" },
  },
  {
    id: "tpl_bug", workspace_slug: "acme", workspace_id: "ws_1", kind: "work_item",
    name: "Bug report", visibility: "public", version: 1, created_at: "2026-07-07T09:00:00Z",
    content: { fields: { type: "bug", priority: "high" }, checklist: ["Repro steps", "Expected", "Actual"] },
  },
  {
    id: "tpl_weekly", workspace_slug: "acme", workspace_id: "ws_1", kind: "work_item",
    name: "Weekly report", visibility: "private", version: 1, created_at: "2026-07-08T09:00:00Z",
    content: { fields: { type: "task" }, checklist: ["Wins", "Blockers", "Next week"] },
  },
];

let seq = templates.length;

function out(t: IMockTemplate): ITemplate {
  const { workspace_slug: _s, ...wire } = t;
  void _s;
  return wire;
}

function find(slug: string, id: string): IMockTemplate {
  const t = templates.find((x) => x.workspace_slug === slug && x.id === id);
  if (!t) throw new APIError(404, "Template not found");
  return t;
}

export function makeTemplateHandlers(): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/templates\/$/,
      resolve: ([, slug], _b, query) => {
        const kind = query.get("kind");
        return clone(
          templates
            .filter((t) => t.workspace_slug === slug && (!kind || t.kind === kind))
            .map(out),
        );
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/templates\/draft\/$/,
      resolve: (_m, body) => {
        const text = ((body ?? {}) as { text?: string }).text ?? "";
        const name = text.trim().slice(0, 60) || "Drafted template";
        return {
          kind: "work_item",
          name,
          content: {
            fields: { type: "task" },
            checklist: ["Define scope", "Implement", "Verify"],
          },
        };
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/templates\/$/,
      resolve: ([, slug], body) => {
        const b = (body ?? {}) as Partial<ITemplate>;
        if (!b.name?.trim() || !b.kind) throw new APIError(400, "name and kind are required");
        const created: IMockTemplate = {
          id: `tpl_${++seq}`,
          workspace_slug: slug,
          workspace_id: "ws_1",
          kind: b.kind,
          name: b.name.trim(),
          visibility: b.visibility ?? "private",
          content: b.content ?? {},
          version: 1,
          created_at: new Date().toISOString(),
        };
        templates.push(created);
        return clone(out(created));
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/templates\/([^/]+)\/$/,
      resolve: ([, slug, id], body) => {
        const t = find(slug, id);
        const b = (body ?? {}) as Partial<ITemplate>;
        if (b.name !== undefined) t.name = b.name.trim();
        if (b.visibility !== undefined) t.visibility = b.visibility;
        if (b.content !== undefined) {
          t.content = b.content;
          t.version += 1;
        }
        return clone(out(t));
      },
    },
    {
      method: "DELETE",
      pattern: /^\/workspaces\/([^/]+)\/templates\/([^/]+)\/$/,
      resolve: ([, slug, id]) => {
        const i = templates.findIndex((x) => x.workspace_slug === slug && x.id === id);
        if (i === -1) throw new APIError(404, "Template not found");
        templates.splice(i, 1);
        return { success: true };
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/templates\/([^/]+)\/apply\/$/,
      resolve: ([, slug, , id]) => {
        const t = find(slug, id);
        if (t.kind !== "work_item") throw new APIError(404, "Work-item template not found");
        return { story_id: `st_from_${id}_${Date.now()}` };
      },
    },
  ];
}
