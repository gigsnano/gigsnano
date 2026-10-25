import { z } from "zod";
import type { GigsnanoClient } from "./client.js";
import { resolveContext } from "./context.js";

function text(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

const PRIORITY = z.enum(["urgent", "high", "medium", "low", "none"]);
const STATUS = z.enum(["todo", "in_progress", "in_review", "done"]);
const TYPE = z.enum(["story", "bug", "epic", "task"]);

/**
 * Rich-text format, stated by the caller and never guessed from the content.
 *
 * This package used to send descriptions and comment bodies through untouched
 * while the Python server converted them — same tool names, opposite behaviour,
 * so Markdown sent through here rendered as literal `##` and `**` (the GIN-134
 * bug, still live on this path). Declaring the format fixes that without this
 * package needing a converter at all: the API does the conversion (GIN-304).
 */
const CONTENT_FORMAT = z.enum(["markdown", "html", "json"]);
const DEFAULT_CONTENT_FORMAT = "markdown" as const;

/** Each code costs one request, so the batch is bounded rather than fanning out freely. */
const MAX_BULK_CODES = 50;
/** Mirrors the API's own page cap; asking for more silently gets clamped there anyway. */
const MAX_PAGE = 200;

/**
 * The fields worth showing in a list — full bodies would drown the context.
 * `sub_issue_count` earns its place: without it, spotting which rows are epics
 * with children costs a get_work_item per row.
 */
const summarize = (s: {
  code: string | null;
  title: string;
  status: string;
  priority: string;
  type?: string;
  assignee_id?: string | null;
  sub_issue_count?: number;
}) => ({
  code: s.code,
  title: s.title,
  status: s.status,
  priority: s.priority,
  type: s.type,
  assignee_id: s.assignee_id,
  ...(s.sub_issue_count ? { sub_issue_count: s.sub_issue_count } : {}),
});

/** Shape a page into a result that can't be mistaken for the whole set. */
const page = <T,>(items: T[], total: number, offset = 0) => ({
  total,
  returned: items.length,
  offset,
  truncated: offset + items.length < total,
  items,
});

export function buildTools(client: GigsnanoClient, ctxOpts: { repoFullName?: string | null }) {
  let cached: ReturnType<typeof resolveContext> | undefined;
  const ctx = () => {
    if (!cached) {
      cached = resolveContext(client, ctxOpts).catch((err) => {
        cached = undefined;
        throw err;
      });
    }
    return cached;
  };
  // Resolve the active project/workspace, honoring an optional per-call
  // `project` override ("workspace_slug/project_id"); otherwise the cached ctx.
  const active = (a?: { project?: string }) =>
    a?.project ? resolveContext(client, { ...ctxOpts, project: a.project }) : ctx();

  return {
    // ─────────────────────────── Workflow (existing 5) ───────────────────────────
    list_my_work_items: {
      schema: z.object({}),
      handler: async () => {
        const { workspace_slug } = await ctx();
        const items = await client.myStories(workspace_slug);
        return text(items.map((s) => ({ code: s.code, title: s.title, status: s.status, priority: s.priority })));
      },
    },
    get_work_item: {
      schema: z.object({ code: z.string() }),
      handler: async ({ code }: { code: string }) => {
        const { workspace_slug } = await ctx();
        return text(await client.resolveStory(workspace_slug, code));
      },
    },
    fetch_work_items: {
      schema: z.object({
        codes: z.array(z.string()).min(1).max(MAX_BULK_CODES),
      }),
      handler: async ({ codes }: { codes: string[] }) => {
        const { workspace_slug } = await ctx();
        const { items, errors } = await client.bulkResolveStories(workspace_slug, codes);
        // Unknown codes are reported, not thrown: one typo shouldn't discard the
        // items that did resolve.
        return text(errors.length ? { items, errors } : { items });
      },
    },
    list_sub_work_items: {
      schema: z.object({ code: z.string() }),
      handler: async ({ code }: { code: string }) => {
        const { workspace_slug } = await ctx();
        const parent = await client.resolveStory(workspace_slug, code);
        const children = await client.subStories(workspace_slug, parent.project_id, parent.id);
        return text({ parent: parent.code, count: children.length, items: children.map(summarize) });
      },
    },
    start_work_item: {
      schema: z.object({ code: z.string() }),
      handler: async ({ code }: { code: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, code);
        const updated = await client.updateStory(workspace_slug, s.project_id, s.id, { status: "in_progress" });
        await client.addComment(workspace_slug, s.project_id, s.id, "Picked up via Claude Code.", DEFAULT_CONTENT_FORMAT);
        return text(updated);
      },
    },
    add_comment: {
      schema: z.object({ code: z.string(), body: z.string(), content_format: CONTENT_FORMAT.optional() }),
      handler: async ({ code, body, content_format }: { code: string; body: string; content_format?: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, code);
        await client.addComment(workspace_slug, s.project_id, s.id, body, content_format ?? DEFAULT_CONTENT_FORMAT);
        return text({ ok: true });
      },
    },
    complete_work_item: {
      schema: z.object({ code: z.string(), pr_url: z.string().optional(), summary: z.string().optional() }),
      handler: async ({ code, pr_url, summary }: { code: string; pr_url?: string; summary?: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, code);
        const updated = await client.updateStory(workspace_slug, s.project_id, s.id, { status: "in_review" });
        const note = [summary, pr_url ? `PR: ${pr_url}` : ""].filter(Boolean).join("\n\n")
          || "Completed via Claude Code.";
        await client.addComment(workspace_slug, s.project_id, s.id, note, DEFAULT_CONTENT_FORMAT);
        return text(updated);
      },
    },

    // ─────────────────────────── Work items ───────────────────────────
    list_work_items: {
      schema: z.object({
        project: z.string().optional(),
        status: STATUS.optional(),
        assignee_id: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().int().positive().max(MAX_PAGE).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      handler: async (a: {
        project?: string;
        status?: string;
        assignee_id?: string;
        q?: string;
        limit?: number;
        offset?: number;
      }) => {
        const c = await active(a);
        const { items, total } = await client.listStories(c.workspace_slug, c.project_id, {
          status: a.status,
          assignee_id: a.assignee_id,
          q: a.q,
          limit: a.limit,
          offset: a.offset,
        });
        // `total` and `truncated` are the point: the API pages at 50 by default,
        // and a bare array of 50 out of 177 reads as "that's all of them".
        return text(page(items.map(summarize), total, a.offset ?? 0));
      },
    },
    search_work_items: {
      schema: z.object({
        q: z.string().min(1),
        status: STATUS.optional(),
        limit: z.number().int().positive().max(MAX_PAGE).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      handler: async (a: { q: string; status?: string; limit?: number; offset?: number }) => {
        const { workspace_slug } = await ctx();
        const { items, total } = await client.searchStories(workspace_slug, a);
        return text(page(items.map(summarize), total, a.offset ?? 0));
      },
    },
    create_work_item: {
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        content_format: CONTENT_FORMAT.optional(),
        type: TYPE.optional(),
        priority: PRIORITY.optional(),
        status: STATUS.optional(),
        assignee_id: z.string().nullable().optional(),
        label_id: z.string().nullable().optional(),
        start_date: z.string().nullable().optional(),
        target_date: z.string().nullable().optional(),
        cycle_id: z.string().nullable().optional(),
        module_id: z.string().nullable().optional(),
        // `parent` accepts a work-item code (e.g. "GIN-313"); `parent_id` a UUID (GIN-348).
        parent: z.string().optional(),
        parent_id: z.string().nullable().optional(),
        project: z.string().optional(),
      }),
      handler: async (a: Record<string, unknown>) => {
        const c = await active(a as { project?: string });
        const { project: _project, parent, ...payload } = a;
        if (parent) {
          payload.parent_id = (await client.resolveStory(c.workspace_slug, parent as string)).id;
        }
        // The API defaults to "html" for the editor; agents send Markdown, so the
        // default belongs to the caller, not the endpoint.
        if (payload.description !== undefined) {
          payload.content_format = payload.content_format ?? DEFAULT_CONTENT_FORMAT;
        }
        return text(await client.createStory(c.workspace_slug, c.project_id, payload));
      },
    },
    update_work_item: {
      schema: z.object({
        code: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        content_format: CONTENT_FORMAT.optional(),
        type: TYPE.optional(),
        status: STATUS.optional(),
        priority: PRIORITY.optional(),
        assignee_id: z.string().nullable().optional(),
        label_id: z.string().nullable().optional(),
        start_date: z.string().nullable().optional(),
        target_date: z.string().nullable().optional(),
        // Backdate imported work to when it really started (GIN-527). Every
        // date-windowed view reads created_at, so items left on the import date
        // report a spike that never happened. Rejected if in the future; the
        // change is written to the item's history.
        created_at: z.string().optional(),
        cycle_id: z.string().nullable().optional(),
        module_id: z.string().nullable().optional(),
        // `parent` accepts a work-item code (e.g. "GIN-313"); `parent_id` a UUID (GIN-348).
        parent: z.string().optional(),
        parent_id: z.string().nullable().optional(),
      }),
      handler: async (a: { code: string } & Record<string, unknown>) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, a.code);
        const { code: _code, parent, ...patch } = a;
        if (parent) {
          patch.parent_id = (await client.resolveStory(workspace_slug, parent as string)).id;
        }
        if (patch.description !== undefined) {
          patch.content_format = patch.content_format ?? DEFAULT_CONTENT_FORMAT;
        }
        return text(await client.updateStory(workspace_slug, s.project_id, s.id, patch));
      },
    },

    // ─────────────────────────── Comments ───────────────────────────
    list_comments: {
      schema: z.object({ code: z.string() }),
      handler: async ({ code }: { code: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, code);
        return text(await client.listComments(workspace_slug, s.project_id, s.id));
      },
    },
    update_comment: {
      schema: z.object({ code: z.string(), comment_id: z.string(), body: z.string(), content_format: CONTENT_FORMAT.optional() }),
      handler: async ({ code, comment_id, body, content_format }: { code: string; comment_id: string; body: string; content_format?: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, code);
        return text(await client.updateComment(workspace_slug, s.project_id, s.id, comment_id, body, content_format ?? DEFAULT_CONTENT_FORMAT));
      },
    },
    delete_comment: {
      schema: z.object({ code: z.string(), comment_id: z.string() }),
      handler: async ({ code, comment_id }: { code: string; comment_id: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, code);
        await client.deleteComment(workspace_slug, s.project_id, s.id, comment_id);
        return text({ ok: true });
      },
    },

    // ─────────────────────────── Documents ───────────────────────────
    list_documents: {
      schema: z.object({ code: z.string() }),
      handler: async ({ code }: { code: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, code);
        return text(await client.listStoryDocuments(workspace_slug, s.project_id, s.id));
      },
    },
    get_document: {
      schema: z.object({ document_id: z.string() }),
      handler: async ({ document_id }: { document_id: string }) => {
        const { workspace_slug } = await ctx();
        return text(await client.getDocument(workspace_slug, document_id));
      },
    },
    attach_file: {
      schema: z.object({ code: z.string(), title: z.string(), file_name: z.string(), mime_type: z.string(), content: z.string() }),
      handler: async (a: { code: string; title: string; file_name: string; mime_type: string; content: string }) => {
        const { workspace_slug } = await ctx();
        const s = await client.resolveStory(workspace_slug, a.code);
        return text(await client.uploadStoryDocument(workspace_slug, s.project_id, s.id, {
          title: a.title, file_name: a.file_name, mime_type: a.mime_type, content: a.content,
        }));
      },
    },
    delete_document: {
      schema: z.object({ document_id: z.string() }),
      handler: async ({ document_id }: { document_id: string }) => {
        const { workspace_slug } = await ctx();
        await client.deleteDocument(workspace_slug, document_id);
        return text({ ok: true });
      },
    },

    // ─────────────────────────── Projects ───────────────────────────
    list_projects: {
      schema: z.object({}),
      handler: async () => {
        const { workspace_slug } = await ctx();
        return text(await client.listProjects(workspace_slug));
      },
    },
    get_project: {
      schema: z.object({ project: z.string().optional() }),
      handler: async (a: { project?: string }) => {
        const c = await active(a);
        return text(await client.getProject(c.workspace_slug, c.project_id));
      },
    },

    // ─────────────────────────── Metadata ───────────────────────────
    list_statuses: {
      schema: z.object({ project: z.string().optional() }),
      handler: async (a: { project?: string }) => {
        const c = await active(a);
        return text(await client.listStates(c.workspace_slug, c.project_id));
      },
    },
    list_labels: {
      schema: z.object({ project: z.string().optional() }),
      handler: async (a: { project?: string }) => {
        const c = await active(a);
        return text(await client.listLabels(c.workspace_slug, c.project_id));
      },
    },
    create_label: {
      schema: z.object({ name: z.string(), color: z.string().default("#6b7280"), project: z.string().optional() }),
      handler: async (a: { name: string; color: string; project?: string }) => {
        const c = await active(a);
        return text(await client.createLabel(c.workspace_slug, c.project_id, { name: a.name, color: a.color }));
      },
    },
    list_cycles: {
      schema: z.object({ project: z.string().optional() }),
      handler: async (a: { project?: string }) => {
        const c = await active(a);
        return text(await client.listCycles(c.workspace_slug, c.project_id));
      },
    },
    list_modules: {
      schema: z.object({ project: z.string().optional() }),
      handler: async (a: { project?: string }) => {
        const c = await active(a);
        return text(await client.listModules(c.workspace_slug, c.project_id));
      },
    },

    // ─────────────────────────── People ───────────────────────────
    list_users: {
      schema: z.object({}),
      handler: async () => {
        const { workspace_slug } = await ctx();
        return text(await client.listMembers(workspace_slug));
      },
    },
    get_user: {
      schema: z.object({ user_id: z.string() }),
      handler: async ({ user_id }: { user_id: string }) => {
        return text(await client.getUser(user_id));
      },
    },
  };
}
