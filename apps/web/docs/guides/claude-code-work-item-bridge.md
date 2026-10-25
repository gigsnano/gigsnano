# Claude Code work-item bridge: setup guide

This guide connects a repo's Claude Code session directly to GigsNano work
items. Once set up, you can say "work on WEB-42" in Claude Code and it will
pull the story's context from GigsNano, claim it, do the work using
Superpowers, open a PR, and hand it back for review — without leaving the
editor.

The bridge has two pieces:

- **`gigsnano-mcp`** — an MCP stdio server (`packages/gigsnano-mcp/`) that
  exposes GigsNano work items as tools Claude Code can call.
- **The `gigsnano` skill** (`skills/gigsnano/SKILL.md`) — the loop that tells
  Claude Code how to use those tools: pull → claim → work → hand back.

Follow the steps below in order.

## 1. Generate a token

In GigsNano, go to **account settings → Developer tokens** (`ACCOUNT_SETTINGS_TABS`
in the app; the tab icon looks like `</>`), then **Create token**. Copy the
`gnp_...` value immediately — it is shown once and cannot be retrieved again
after you close the dialog. Treat it like a password: it authenticates API
requests as you.

If you lose it, revoke the old token from the same panel and create a new one.

## 2. Confirm the repo is connected

The bridge resolves *which* GigsNano project you mean from the repo you're
sitting in — it reads the `origin` git remote and asks the GigsNano API which
project that repo is connected to. For that lookup to succeed, this repo must
already be the GitHub repo GigsNano has on file for the project:

- **Brownfield ("Document existing project"):** the project was created by
  cloning this repo, so the connection already exists.
- **Greenfield:** open the project, use **Connect GitHub** (project overview
  → GitHub card), authorize, and pick this repo.

You can confirm the link from the project's overview page — it shows the
linked repo name and a "Browse repository files" action once connected.

If this repo's `origin` isn't the one GigsNano has on file (a fork, a mirror,
or a monorepo with more than one GigsNano project), skip the git-remote
lookup entirely with a `.gigsnano.json` — see Troubleshooting below.

## 3. Add the MCP server

You can use either the **hosted MCP endpoint** (OAuth, no local process) or the
**local stdio server** (PAT in env). See `docs/guides/hosted-mcp.md` for the
hosted setup; the steps below cover the stdio path.

### Option A — Hosted (recommended)

```json
{
  "mcpServers": {
    "gigsnano": {
      "url": "https://mcp.gigsnano.com/mcp"
    }
  }
}
```

Reload MCP in Claude Code and complete the browser OAuth login when prompted.
Revoke access under **Account settings → Developer tokens → Connected apps**.

### Option B — Local stdio

Build the server once from the repo root:

```bash
pnpm install
pnpm --filter @gigsnano/mcp build
```

Then add it to *the repo you're actually coding in's* `.mcp.json` (or your
user-level MCP config) — this is the exact block from
`packages/gigsnano-mcp/README.md`:

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

Use the **absolute path** to the built `dist/index.js` — a repo-relative path
like `./packages/gigsnano-mcp/dist/index.js` resolves against the connected
repo you're sitting in (e.g. `acme/web`), not `gigsnano-v2`, so the server
would never start. Once `@gigsnano/mcp` is published to npm, `npx @gigsnano/mcp`
will replace the `node`/absolute-path pair here.

Fill in the token from Step 1 for `GIGSNANO_TOKEN`. Set `GIGSNANO_API_BASE_URL`
to whichever GigsNano API you're using — the local dev backend
(`http://localhost:8020/api`) or your workspace's hosted API URL.

Restart Claude Code (or reload MCP servers) after editing `.mcp.json`. Five
tools become available in any chat: `list_my_work_items`, `get_work_item`,
`start_work_item`, `add_comment`, `complete_work_item`. See the README for the
full tool reference and the `.gigsnano.json` project-resolution details.

## 4. Install the skill

Copy the skill source into this repo's `.claude/skills/`:

```bash
mkdir -p .claude/skills/gigsnano
cp skills/gigsnano/SKILL.md .claude/skills/gigsnano/SKILL.md
```

Claude Code picks up skills from `.claude/skills/<name>/SKILL.md`
automatically — no restart needed beyond the one from Step 3.

## 5. Use it

Read a work-item code off a kanban card in GigsNano (e.g. `WEB-42`), then in
Claude Code just say:

> work on WEB-42

Claude Code will invoke the `gigsnano` skill, which:

1. **Pulls** the story via `get_work_item` (title, description, acceptance
   criteria, priority, type, linked docs).
2. **Claims** it via `start_work_item` (sets In Progress, comments) and
   creates a work branch.
3. **Works** the ticket, routing to the right Superpowers skill
   (brainstorming for ambiguous asks, TDD for features, systematic-debugging
   for bugs), verifying before completion, then requesting code review.
4. **Hands it back**: opens a PR and calls `complete_work_item` with the PR
   URL and a summary, which sets the story to In Review and comments the
   link.

The story never moves to Done on its own — that's a human decision made by
merging the PR (github-sync then flips the story to Done automatically).

## 6. Troubleshooting

- **"Could not determine the GigsNano project."** — the repo's `origin`
  remote doesn't point at a repo GigsNano has connected to a project. Either
  fix the remote / connect the repo (Step 2), or drop a `.gigsnano.json` in
  the repo root as an escape hatch:

  ```json
  {
    "workspace_slug": "acme",
    "project_id": "5f1e...-project-uuid"
  }
  ```

  This skips the git-remote lookup entirely and is the right fix for forks,
  mirrors, or monorepos with more than one GigsNano project.

- **`GigsNano API 401: ...`** — the token is invalid, expired, or was
  revoked. Generate a new one (Step 1) and update `GIGSNANO_TOKEN` in
  `.mcp.json`.

- **Unknown work-item code** — the code belongs to a different project or
  workspace than the one this repo resolves to. Double-check the code
  against the project the repo is actually connected to (Step 2), or use the
  `.gigsnano.json` override to point at the right one.

- **"GIGSNANO_TOKEN is required."** — the server exits immediately at
  startup because the env var is unset; add it to `.mcp.json`.
