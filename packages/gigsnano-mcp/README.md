# gigsnano-mcp

An MCP (Model Context Protocol) stdio server that lets Claude Code (or any
MCP-compatible client) work with GigsNano work items directly from a repo's
coding session — list your assigned stories, pull full context for one, claim
it, comment on it, and hand it back for review, all without leaving the editor.

It resolves *which* GigsNano project you mean from the repo you're sitting in:
by default it reads the `origin` git remote and asks the GigsNano API which
project that repo is connected to. No project id needs to be typed into every
prompt.

## Prerequisites

- A GigsNano **Personal Access Token** (PAT). Create one from
  **Settings → Developer → Tokens** in the GigsNano app. Treat it like a
  password — it authenticates as you.
- The repo you're working in must have an `origin` remote pointing at a GitHub
  repository that is **connected to a GigsNano project** (Project Settings →
  GitHub). That connection is how the server maps `git remote get-url origin`
  → `{workspace_slug, project_id}`.
- Node.js (to run the built server) and access to the GigsNano API — either
  the local dev backend (`http://localhost:8020/api`) or your workspace's
  hosted API URL.

## Build

From the repo root:

```bash
pnpm install
pnpm --filter gigsnano-mcp build
```

This compiles `src/` to `packages/gigsnano-mcp/dist/index.js`.

## Hosted (beta)

GigsNano exposes a **hosted MCP endpoint** on the Python API. Two auth modes:

### OAuth (recommended)

Point any Streamable-HTTP MCP client that supports OAuth 2.1 + PKCE at the API
origin only — no pasted token:

```json
{
  "mcpServers": {
    "gigsnano": {
      "url": "https://mcp.gigsnano.com/mcp"
    }
  }
}
```

The client discovers metadata from `/.well-known/oauth-protected-resource`,
registers via `POST /oauth/register`, and completes a browser login on the
consent screen. Revoke access under **Account settings → Developer tokens →
Connected apps**. Full guide: `docs/guides/hosted-mcp.md`.

Local dev example: `http://localhost:8020/mcp`.

### PAT fallback

You can still pass a Personal Access Token directly:

```json
{
  "mcpServers": {
    "gigsnano": {
      "url": "https://mcp.gigsnano.com/mcp",
      "headers": {
        "Authorization": "Bearer gnp_…"
      }
    }
  }
}
```

Create the PAT under **Settings → Developer → Tokens**. Local dev:
`http://localhost:8020/mcp`.

The hosted server exposes the same 24 tools as this package (workflow, work
items, comments, documents, projects, metadata, people).

## Setup: `.mcp.json`

Add the server to your project's (or user-level) `.mcp.json` so Claude Code
launches it automatically:

```json
{
  "mcpServers": {
    "gigsnano": {
      "command": "node",
      "args": ["/path/to/gigsnano/packages/gigsnano-mcp/dist/index.js"],
      "env": {
        "GIGSNANO_TOKEN": "gnp_...",
        "GIGSNANO_API_BASE_URL": "http://localhost:8020/api"
      }
    }
  }
}
```

Use the **absolute path** to the built `dist/index.js`, not a repo-relative
one — you'll typically add this `.mcp.json` in a *different* repo (the one
you're actually coding in), where a relative `./packages/...` path doesn't
exist. Once `gigsnano-mcp` is published to npm, `npx gigsnano-mcp` will
replace the `node`/absolute-path pair here.

Restart Claude Code (or reload MCP servers) after editing `.mcp.json`. The
tools below become available in any chat.

## Environment variables

| Variable                  | Required | Default                          | Description                                              |
|----------------------------|----------|-----------------------------------|------------------------------------------------------------|
| `GIGSNANO_TOKEN`           | Yes      | —                                  | Your GigsNano PAT. The server exits at startup if unset.   |
| `GIGSNANO_API_BASE_URL`    | No       | `http://localhost:8020/api`        | Base URL of the GigsNano API to call.                      |

## Tools

All tools return their result as JSON text in the MCP tool-result `content`
array. Work items are always addressed by their human-readable `code`
(e.g. `WEB-42`), not an internal id. Project-scoped tools operate on the
resolved active project; those marked *(project?)* accept an optional
`project` override (`"workspace_slug/project_id"`).

**Workflow** — the developer pull→claim→hand-back loop:

| Tool                  | Arguments                                        | What it does                                                                 |
|------------------------|---------------------------------------------------|-------------------------------------------------------------------------------|
| `list_my_work_items`   | *(none)*                                           | Lists stories assigned to you in the current repo's project: `{code, title, status, priority}`. |
| `get_work_item`        | `{ code }`                                         | Returns the full story JSON for one work item.                                |
| `start_work_item`      | `{ code }`                                         | Sets the story to **In Progress** and posts a "Picked up via Claude Code" comment. |
| `add_comment`          | `{ code, body }`                                   | Posts a comment on the story.                                                 |
| `complete_work_item`   | `{ code, pr_url?, summary? }`                      | Sets the story to **In Review** (never `done` — a human/agent-reviewer still moves it to Done) and posts a comment with the PR link and summary. |

**Work items:**

| Tool | Arguments | What it does |
|---|---|---|
| `list_work_items` | `{ status?, assignee_id?, project? }` | Lists work items in the active project (trimmed rows). |
| `create_work_item` | `{ title, description?, type?, priority?, status?, assignee_id?, label_id?, start_date?, target_date?, cycle_id?, module_id?, parent_id?, project? }` | Creates a work item. |
| `update_work_item` | `{ code, ...fields }` | Updates a work item's fields by code. |

**Comments:**

| Tool | Arguments | What it does |
|---|---|---|
| `list_comments` | `{ code }` | Lists a work item's comments. |
| `update_comment` | `{ code, comment_id, body }` | Edits a comment. |
| `delete_comment` | `{ code, comment_id }` | Deletes a comment. |

**Documents:** `attach_file` supports **PDF, DOCX, and text only** — GigsNano has no image attachment storage.

| Tool | Arguments | What it does |
|---|---|---|
| `list_documents` | `{ code }` | Lists documents attached to / produced from a work item. |
| `get_document` | `{ document_id }` | Fetches one document. |
| `attach_file` | `{ code, title, file_name, mime_type, content }` | Attaches a PDF/DOCX/text file (image mime types are rejected). |
| `delete_document` | `{ document_id }` | Deletes a document. |

**Projects:**

| Tool | Arguments | What it does |
|---|---|---|
| `list_projects` | *(none)* | Lists the workspace's projects. |
| `get_project` | `{ project? }` | Fetches the active (or overridden) project. |

**Metadata:**

| Tool | Arguments | What it does |
|---|---|---|
| `list_statuses` | `{ project? }` | Lists the project's work-item statuses. |
| `list_labels` | `{ project? }` | Lists the project's labels. |
| `create_label` | `{ name, color?, project? }` | Creates a label. |
| `list_cycles` | `{ project? }` | Lists the project's cycles (sprints). |
| `list_modules` | `{ project? }` | Lists the project's modules. |

**People:**

| Tool | Arguments | What it does |
|---|---|---|
| `list_users` | *(none)* | Lists workspace members (the people you can assign work to). |
| `get_user` | `{ user_id }` | Fetches a user by id. |

### Status policy

`start_work_item` and `complete_work_item` are the only tools that change a
story's status, and they intentionally never set `done`:

- `start_work_item` → `in_progress`
- `complete_work_item` → `in_review`

Marking work `done` is a separate, human (or reviewing-agent) decision made in
the GigsNano UI after review — this server only ever hands work *back* for
review, it doesn't close it out.

## Project resolution (`.gigsnano.json` escape hatch)

Project resolution happens in this order, per call:

1. An explicit `project` option in the form `workspace_slug/project_id`, if
   the caller supplied one.
2. A `.gigsnano.json` file in the repo root, if present:

   ```json
   {
     "workspace_slug": "acme",
     "project_id": "5f1e...-project-uuid"
   }
   ```

   Use this when the repo's `origin` remote isn't the one connected in
   GigsNano (forks, mirrors, monorepos with multiple GigsNano projects, etc.)
   — it skips the git-remote lookup entirely.
3. Falling back to the git `origin` remote, normalized to `owner/repo` and
   resolved via the GigsNano API (`GET /projects/by-repo`).

If none of these resolve to a project, every tool call fails with an error
explaining what was tried and how to fix it (add a matching `origin` remote,
or drop in a `.gigsnano.json`).

## Troubleshooting

- **"GIGSNANO_TOKEN is required."** — the server exits immediately at
  startup; set the env var in `.mcp.json` or your shell.
- **"Could not determine the GigsNano project."** — the repo has no `origin`
  remote pointing at a connected GitHub repo, and no `.gigsnano.json` was
  found. Add one of the two.
- **`GigsNano API <status>: <message>`** — the API rejected the request
  (expired/invalid token, unknown work-item code, etc.); the message is
  relayed from the backend's error response.
