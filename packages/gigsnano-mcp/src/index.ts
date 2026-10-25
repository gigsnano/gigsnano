#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { GigsnanoClient, ApiError } from "./client.js";
import { getRepoFullName } from "./repo.js";
import { buildTools } from "./tools.js";

const token = process.env.GIGSNANO_TOKEN;
if (!token) {
  console.error("GIGSNANO_TOKEN is required.");
  process.exit(1);
}
const baseUrl = process.env.GIGSNANO_API_BASE_URL ?? "http://localhost:8020/api";

const client = new GigsnanoClient({ baseUrl, token });
const repoFullName = await getRepoFullName();
const tools = buildTools(client, { repoFullName });

const DESCRIPTIONS: Record<string, string> = {
  // Workflow
  list_my_work_items: "List work items assigned to you in the current repo's project.",
  get_work_item: "Fetch a work item's full context by code (e.g. WEB-42).",
  fetch_work_items:
    "Fetch several work items at once by code (max 50). Prefer this over repeated get_work_item calls. Unknown codes are returned in `errors` rather than failing the batch.",
  list_sub_work_items:
    "List an epic's or story's actual sub-items by parent code. Use this instead of guessing that children are the next codes in sequence — they often aren't.",
  search_work_items:
    "Search work items across the whole workspace by text. Use before filing a new item to check it doesn't already exist; needs no project id.",
  start_work_item: "Claim a work item: set it In Progress and comment.",
  add_comment: "Add a comment to a work item."+
    " Rich text is Markdown by default (CommonMark + GFM tables, task lists, fenced code, ```mermaid); pass content_format='html' or 'json' to change that. Never guessed from content.",
  complete_work_item: "Hand a work item back for review (In Review) with a PR link + summary.",
  // Work items
  list_work_items:
    "List work items in the active project (optional status/assignee/q filters, limit/offset). Returns `total` and `truncated` — the API pages at 50, so check them before concluding you've seen every item.",
  create_work_item: "Create a work item in the active project."+
    " Rich text is Markdown by default (CommonMark + GFM tables, task lists, fenced code, ```mermaid); pass content_format='html' or 'json' to change that. Never guessed from content.",
  update_work_item: "Update a work item's fields by code (status, priority, assignee, dates, …)."+
    " Rich text is Markdown by default (CommonMark + GFM tables, task lists, fenced code, ```mermaid); pass content_format='html' or 'json' to change that. Never guessed from content.",
  // Comments
  list_comments: "List a work item's comments by code.",
  update_comment: "Edit a comment on a work item."+
    " Rich text is Markdown by default (CommonMark + GFM tables, task lists, fenced code, ```mermaid); pass content_format='html' or 'json' to change that. Never guessed from content.",
  delete_comment: "Delete a comment from a work item.",
  // Documents
  list_documents: "List documents attached to / produced from a work item.",
  get_document: "Fetch one document by id.",
  attach_file: "Attach a file to a work item: PDF, DOCX, text, or a PNG/JPEG/WebP/GIF image (base64 or data: URL; images are signature-validated and previewable).",
  delete_document: "Delete a document by id.",
  // Projects
  list_projects: "List projects in the workspace.",
  get_project: "Fetch the active (or overridden) project's details.",
  // Metadata
  list_statuses: "List the project's work-item statuses.",
  list_labels: "List the project's labels.",
  create_label: "Create a label in the project (name + color).",
  list_cycles: "List the project's cycles (sprints).",
  list_modules: "List the project's modules.",
  // People
  list_users: "List workspace members (the people you can assign work to).",
  get_user: "Fetch a user by id.",
};

const server = new Server({ name: "gigsnano-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, t]) => ({
    name,
    description: DESCRIPTIONS[name],
    inputSchema: zodToJsonSchema(t.schema),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools[req.params.name as keyof typeof tools];
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  try {
    const args = tool.schema.parse(req.params.arguments ?? {});
    return await tool.handler(args as never);
  } catch (e) {
    const msg = e instanceof ApiError ? `GigsNano API ${e.status}: ${e.message}` : String(e);
    return { content: [{ type: "text", text: msg }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
