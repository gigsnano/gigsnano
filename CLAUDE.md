# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GigsNano is an open-source (AGPL-3.0) project-management app that embeds BMAD-method AI agents into an agile workflow. This is a monorepo:

| Path | What | Guide |
|---|---|---|
| `apps/web` | Next.js 16 frontend (`@gigsnano/web`) | `apps/web/CLAUDE.md` |
| `apps/api` | FastAPI + async SQLAlchemy backend (Python 3.12, uv, Alembic) | `apps/api/CLAUDE.md` |
| `packages/core` | `@gigsnano/core` — types, HTTP client, briefing rules, brand tokens shared with the mobile app; published to npm | — |
| `packages/gigsnano-mcp` | MCP server exposing GigsNano work items to coding agents | — |

Read the per-app guide before changing code in that app. Architecture and Sprint-0 specs live in `apps/web/docs/base-guides/`.

## Commands (from the repo root)

```bash
docker compose up --build                 # whole stack: Postgres + API (:8020) + web (:3000), keyless
pnpm install                              # JS deps for apps/web + packages/*
pnpm --filter @gigsnano/web dev           # web dev server (expects the API on :8020)
pnpm -r test                              # all JS test suites
(cd apps/api && uv sync && uv run pytest -q)   # backend tests (in-memory SQLite, no services)
(cd apps/api && uv run uvicorn gigsnano_api.app:app --reload --port 8020)   # API dev server
```

## Cross-cutting rules

- **Keyless by default.** Every external integration (LLM, GitHub, email, Stripe, webhooks) has a fake provider selected when its env var is empty. Keep it that way — a fresh clone must boot with no keys.
- **`BILLING_ENABLED`** defaults to `false` (self-host). Only the hosted service turns it on.
- **API contract changes** touch both apps: backend schema in `apps/api`, TypeScript types in `packages/core/src/types/` (or `apps/web/src/types/` for web-only domains), and the mock fixtures in `apps/web/src/mocks/` must keep matching the real response shape.
- **Quality gates:** react-doctor for `apps/web`, python-doctor + ruff for `apps/api`. The Claude Code hooks in `.claude/settings.json` run both after every edit batch; fix what they report.
- Never put real customer or client names in fixtures, examples or docs.
