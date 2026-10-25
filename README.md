<p align="center">
  <img src="apps/web/public/logo-light.png" alt="GigsNano" width="220">
</p>

<p align="center">
  Project management with AI agents built into the workflow.
  <br>
  <a href="https://app.gigsnano.com">Hosted version</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue"></a>
</p>

---

GigsNano is a lighter alternative to Plane or Jira with specialised AI agents — Analyst, Product Manager, Architect, Scrum Master, Developer, UX, Test — embedded in an agile workflow. Creating a project generates a **Sprint-0** board of [BMAD-method](https://github.com/bmad-code-org/BMAD-METHOD) planning steps. Each card opens a chat with the agent that owns the step; finishing a card unlocks the next. By the end of Sprint-0 you have a project brief, PRD, architecture, epics, stories and a sprint plan — then the usual tools: cycles, modules, kanban, work items, docs, dashboards.

## Quick start (self-host)

Requires Docker.

```bash
git clone https://github.com/gigsnano/gigsnano.git
cd gigsnano
docker compose up --build
```

Open <http://localhost:3000> and sign up. This runs Postgres, the API (`:8020`) and the web app (`:3000`) with **no API keys**: the AI agents answer with canned replies, email and payments use fake providers, and GitHub clones are simulated. Add real providers with the variables below.

Before exposing an instance to the internet, put it behind HTTPS, set `COOKIE_SECURE=true` and a random `JWT_SECRET` of 32+ bytes (the API refuses to start with the dev default when `COOKIE_SECURE=true`). Only the web app (`:3000`) needs to be reachable; Postgres and the API are bound to localhost. Requires Docker Compose 2.24+.

## Configuration

Backend variables go in `apps/api/.env` (see `apps/api/.env.example`) or the compose environment. Empty means "use the fake provider".

| Feature | Variables |
|---|---|
| AI agents (Anthropic) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Google sign-in | `GOOGLE_CLIENT_ID` (API) **and** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web, same value) |
| GitHub connect / repo clone | `GITHUB_OAUTH_CLIENTID`, `GITHUB_OAUTH_CLIENTSECRET` |
| Email | `ACS_CONNECTION_STRING`, `EMAIL_FROM` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REAL_DELIVERY=true` |
| Payments + workspace wallet | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_ENABLED=true` |

`BILLING_ENABLED` is `false` by default: AI usage is still recorded, but no workspace wallet is charged or required.

`NEXT_PUBLIC_*` variables are inlined into the web bundle at **build time** — rebuild the web image after changing them (`docker compose build web`).

## Development

```bash
pnpm install
docker compose up -d db                                         # Postgres on :5433
(cd apps/api && uv sync && uv run alembic upgrade head)
(cd apps/api && uv run uvicorn gigsnano_api.app:app --reload --port 8020)
cp apps/web/.env.example apps/web/.env.local
pnpm dev                                                        # web on :3000
```

Tests: `pnpm -r test` (web, core, MCP) and `cd apps/api && uv run pytest`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

| Path | |
|---|---|
| `apps/web` | Next.js 16 · React 19 · Tailwind v4 · TanStack Query · assistant-ui |
| `apps/api` | FastAPI · async SQLAlchemy · Alembic · Python 3.12 (uv) |
| `packages/core` | `@gigsnano/core` — shared types, API client and design tokens |
| `packages/gigsnano-mcp` | MCP server that lets coding agents work GigsNano work items |

Architecture notes: `apps/web/docs/base-guides/`.

## License

GigsNano is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a network service, you must make your source available to its users. The GigsNano name and logo are not covered by the license — see [TRADEMARK.md](TRADEMARK.md). Third-party notices are in [NOTICE](NOTICE).
