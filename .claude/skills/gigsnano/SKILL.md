---
name: gigsnano
description: Work a GigsNano work item end-to-end from its code (e.g. WEB-42) — pull context, claim it, implement via Superpowers, open a PR, and hand it back for review. Trigger when the user gives a work-item code or says "work on <CODE>".
---

# Working a GigsNano work item

You have the `gigsnano` MCP tools available. Follow this loop exactly.

## 0. Pick the workspace (only if needed)
Work-item codes resolve within the **active** workspace. If a `get_work_item`
call fails with `No project '<X>' in workspace`, the code lives elsewhere:
call `list_workspaces`, then `set_active_workspace({ workspace })` and retry.
Don't guess the workspace — surface the list if it's ambiguous.

## 1. Pull
Call `get_work_item({ code })`. Read the title, description, acceptance
criteria, priority, type, and any linked docs. These are your task + your
definition of done.

**If it's an epic** (`sub_issue_count > 0`), call `list_sub_work_items({ code })`
for its real children — do NOT assume they're the next codes in sequence. They
often aren't, and guessing pulls in unrelated tickets. Then
`fetch_work_items({ codes })` to read them all in one call.

**`list_work_items` pages at 50.** It returns `total` and `truncated` — read them.
A page is not the project; if `truncated` is true, raise `limit` or `offset`
rather than concluding you've seen everything.

## 2. Claim
Call `start_work_item({ code })` (sets In Progress + comments). Create a
work branch named `<code>-<short-slug>`.

## 3. Work

### Read before you edit
Start from the per-app guides (`apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`) and
search for the exact symbols you will change; open only the files and lines you
need. The backend lives in `apps/api` in this repo.

### Route to the right Superpowers skill
- Requirements unclear or ambiguous → **superpowers:brainstorming** first.
- Feature / change → **superpowers:test-driven-development**.
- Bug ticket (type = bug) → **superpowers:systematic-debugging**.
- New or reshaped UI → **emil-design-eng** (component polish + invisible details)
  and **transitions-dev** (open/close, page, staggered transitions). Any visual
  work routes through these before it's done.
- Before you claim it's done → **superpowers:verification-before-completion**,
  then **superpowers:requesting-code-review**.
The work item's acceptance criteria are the pass/fail bar.

### UI house rules (non-negotiable)
- **Never hardcode colors.** Use the shadcn CSS-var design tokens
  (`bg-primary`, `text-muted-foreground`, `border`, …) so light/dark both work —
  no hex, no `rgb()`, no fixed Tailwind color classes like `bg-blue-500`.
- **Match the app's aesthetic.** Reuse existing primitives (`@/components/ui`,
  `@/components/layout`, `EmptyState`) and patterns rather than inventing new
  chrome; keep the enterprise, no-layout-shift feel.
- Reach for `transitions-dev` for motion; don't hand-roll ad-hoc animations.

## 4. Hand back
Open a PR (the repo is known). Call
`complete_work_item({ code, pr_url, summary })` — this sets In Review and
comments the PR link + summary.

## Guardrails
- NEVER move an item to Done. Stop at In Review. Done comes from a human
  merging the PR (github-sync flips it automatically).
- Keep the developer in the loop: get plan approval and review in-session.
- If a tool errors (auth, unresolved repo, unknown code), surface the exact
  message and stop — do not guess.

## Reference: available tools
The MCP server (`gigsnano`) exposes **31 tools** (incl. `route_work_item` / `coordinate_work_item` — the Task Router, GIN-229). This loop only needs a few of
the workflow tools, but all are available in-session.

**Core work-item loop**

| Tool                  | Arguments                        | Used in this loop |
|------------------------|-----------------------------------|--------------------|
| `list_workspaces`      | *(none)*                          | Step 0 — list workspaces to pick the active one. |
| `set_active_workspace` | `{ workspace }`                   | Step 0 — switch which workspace the MCP acts on. |
| `list_my_work_items`   | *(none)*                          | Optional — "what's assigned to me" instead of naming a code. |
| `get_work_item`        | `{ code }`                        | Step 1 (Pull) |
| `fetch_work_items`     | `{ codes }` (max 50)              | Step 1 — many codes in ONE call. Prefer over looping `get_work_item`. Bad codes come back in `errors`, not as a failure. |
| `list_sub_work_items`  | `{ code }`                        | Step 1 — an epic's REAL children. Never infer them from the code sequence. |
| `start_work_item`      | `{ code }`                        | Step 2 (Claim) |
| `add_comment`          | `{ code, body }`                  | Optional — interim status updates during Step 3. |
| `complete_work_item`   | `{ code, pr_url?, summary? }`     | Step 4 (Hand back) |

**Everything else (richer sessions, not needed for the core loop)**

- Work items: `search_work_items` (`{ q, status?, limit?, offset? }` — **workspace-wide**, no project id; use it before creating an item to check one doesn't already exist), `list_work_items` (`{ project, status?, assignee_id?, q?, limit?, offset? }` — returns `total`/`truncated`; **pages at 50**), `create_work_item`, `update_work_item`
- Comments: `list_comments`, `update_comment`, `delete_comment`
- Documents: `list_documents`, `get_document`, `attach_file` (PDF/DOCX/text only), `delete_document`
- Projects: `list_projects`, `get_project`
- Metadata: `list_statuses`, `list_labels`, `create_label`, `list_cycles`, `list_modules`
- People: `list_users`, `get_user`

### There are TWO MCP servers — change both
- **`apps/api/src/gigsnano_api/mcp_server/`** (Python, hosted over OAuth) — **this is the one Claude Code talks to.** It alone has `list_workspaces`/`set_active_workspace`.
- **`packages/gigsnano-mcp/`** (TypeScript, stdio, PAT) — the local/BYO client.

They implement overlapping tool sets independently, so a tool added to only one is invisible to the other's users. Adding to just the TS package will NOT change the tools in your own session.

See the package README for full argument details. If you add or remove a tool on
either MCP server, update this count and lists.
