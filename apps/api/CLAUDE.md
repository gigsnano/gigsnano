# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

GigsNano backend — FastAPI + async SQLAlchemy PM-domain API with BMAD (LLM) orchestration. Postgres in prod, in-memory SQLite in tests. Python 3.12, managed with `uv`.

## Commands

```bash
uv sync                                    # install deps (incl. dev group)
uv run pytest -v                           # full suite — in-memory sqlite, no services needed
uv run pytest tests/test_marketplace.py -v # one file
uv run pytest -k "test_accept_invitation"  # one test by name
uv run ruff check .                        # lint (E, F, I; line-length 100, E501 ignored)
uv run ruff format .                       # format
uv run pyright                             # type-check (basic mode, src/ only)
uv run python scripts/python_doctor.py     # python-doctor gate, scoped to your changed lines
python-doctor --verbose                    # the full repo scan + 0-100 health score
uv run alembic upgrade head                # apply migrations
uv run alembic revision --autogenerate -m "msg"   # new migration (see caveat below)
uv run uvicorn gigsnano_api.app:app --reload --port 8020   # dev server (:8020 matches frontend)
```

- `.pre-commit-config.yaml` runs ruff + ruff-format + `python-doctor --scope staged --no-types` on commit.

### python-doctor (the backend's react-doctor)

Quality is enforced by the **`python-doctor`** CLI (security/lint/complexity/structure/exceptions/zen + a 0-100 health score), wrapped by `scripts/python_doctor.py` and wired into the same three gates as the frontend's react-doctor:

- **Agent hook** (`.claude/settings.json`, `PostToolBatch`) runs it after every edit batch and feeds findings back — **fix what it reports before finishing.**
- **Pre-commit** runs it on the staged lines.
- **CI** (`.github/workflows/python-doctor.yml`) runs it against the PR's merge base and fails on findings.

All three are **line-scoped to your change** (`--scope changed|staged|all`), so the ~200 pre-existing findings never block — only what you introduce does. File-level findings (e.g. `large-file`) are reported only for files you actually added, and a line that this same change deleted from another file is treated as *moved*, not written — so splitting a file doesn't report its whole body as new. Run `python-doctor --verbose` for the unfiltered repo view and the score.

The wrapper adds **house rules** the generic tool cannot know, each of which broke production once:
- a route path with no trailing slash (the frontend `/api` proxy 502s on it),
- a bare `async_session()` outside `core/db.py` (bypasses the test override → hits the PROD DB),
- a new migration that leaves alembic multi-headed (`alembic upgrade head` then fails in `entrypoint.sh`, taking the API down).

Add a rule when a class of bug bites twice — `house_rules()` in that script, not a scattered comment.

**Accepted residue — do NOT "fix" these** (score is 73/100 after the 2026-07-22 cleanup; lint, exceptions and the false-positive security findings are at zero):
- `bandit B603/B607/B404` (subprocess) — the service shells out to `git`, `scip` and the agent toolchain by design. Review new ones on their merits; don't blanket-suppress.
- `structure/no-type-checker` — a tool false positive: it only recognizes mypy or `pyrightconfig.json`, and this repo configures pyright under `[tool.pyright]` in `pyproject.toml`. Do not add a second config file to satisfy it.
- `structure/no-license` — private repo.
- `complexity/*` and `zen/long-function|too-many-params|deep-nesting` — ~97 findings across mature code. Refactor when you are already changing the function; a score-driven sweep is a regression risk with no behaviour payoff.

A genuine `except: pass` is *not* residue: log it (that is what turned a week-long silent digest outage into a one-line find — see the `noqa: BLE001` sites, every one of which now logs).
- Tests need no DB/network: `asyncio_mode=auto`, everything runs on `aiosqlite`. Without `ANTHROPIC_API_KEY` the app uses a deterministic `FakeProvider`, so LLM paths are testable offline.

## Architecture

Request flow: `app.py::create_app` mounts every feature router under the `/api` prefix. Routes depend on `get_db` (async session) and, when tenant-scoped, on `WorkspaceContext`.

**Multi-tenancy is the spine.** `shared/context.py::WorkspaceContext` resolves `{user, workspace, role, status}` from the `workspace_slug` path param + the caller's membership. Nearly every route depends on `get_workspace_context` (or `_incl_pending` for the accept-invite path); `require_role(...)` gates RBAC. A route that skips this dependency is almost certainly a tenancy bug.

**Auth** is httpOnly-cookie JWT (`gn_access` / `gn_refresh`, set in `auth/deps.py`). `get_current_user` reads the `gn_access` cookie first; without one it accepts `Authorization: Bearer` carrying an MCP OAuth JWT, a mobile access JWT, or a personal access token (`auth/deps.py`). Mobile sign-in (`/auth/mobile/*`) returns tokens in the body, never sets cookies and never creates accounts; its refresh tokens rotate per use and a reused token revokes its whole family (`auth/mobile_tokens.py`). Cookie flags (`secure`, `samesite`) come from settings.

**Package layout** (mid-refactor: the old `domain/` God-package was split — do not recreate it):
- `models/` — SQLAlchemy models, one file per domain area. **Importing `gigsnano_api.models` imports every submodule, registering all tables on `Base.metadata`.** Always import models via `from gigsnano_api.models import Story` (not from submodules) so metadata is complete for Alembic autogenerate and test `create_all`. Enums are `E`-prefixed (`EStoryStatus`, `EWorkspaceRole`, …).
- `features/<name>/router.py` — routes **plus** cross-feature helper functions. Note the gotcha: helpers like `record_activity` (projects), `notify_project_members` (notifications), and `serialize_document` (documents) are imported *from other features' `router.py`*. Feature routers import each other heavily; expect a web, not a tree.
- `shared/` — `context.py` (tenancy, above) and `serializers.py` (story/issue serialization shared across features).
- `core/` — `db.py` (`Base`, `TimestampedBase`, `async_session`, `get_db`, `utcnow`), `config.py` (pydantic-settings), `security.py` (JWT), `pagination.py`.
- Top-level domain packages beside `features/`: `bmad/`, `marketplace/` (contract/escrow/bid lifecycle — **distinct** from `features/marketplace_talent/`, which is talent listings), `billing/` (Stripe Connect, wallet, fees, AI usage), `payments/`, `agent_delegation/` (OAuth to Claude Code / Codex / Cursor), `sync/` (one-way GitHub push), `webhooks/`, `email/` (Azure Communication), `llm/` (usage/cost tracking), `admin/`.

**Models** extend `TimestampedBase`: string-UUID pk + tz-aware `created_at`/`updated_at`. The frontend contract is `id: string`, timestamps as ISO strings — keep pks strings.

**Startup** (`create_app`): validates the BMAD asset registry (fails fast on malformed assets, never mid-chat) and builds long-lived providers onto `app.state` — `llm_provider`, `github_client`, `github_oauth`, `webhook_sender`. The lifespan seeds staff accounts. Reach these via `app.state`, not module globals.

**Mobile push** is an outbox (`push_outbox`) drained by `features/push/worker.py`: it claims rows and commits *before* sending, so delivery is at-most-once — never re-send a claimed row. `notify()` and the governance/recovery/autonomy/delegation hooks enqueue in the caller's transaction; recipients come from `features/inbox/recipients.py` (project access + `push_realtime`). The worker runs only when `push_enabled`; real Expo delivery also needs `push_real_delivery` (otherwise a fake sender).

## BMAD (LLM orchestration)

Per-story agent chat that generates versioned artifacts (brief/prd/architecture/…).
- SSE wire format lives **entirely** in `bmad/sse.py` (AI SDK UI message stream v1). If the frontend `ai` package expects different event names, change only that module.
- Assets are vendored in `bmad_assets/` with a version in `manifest.yaml`. Any content change = version bump + full test suite + one manual Sprint-0 run.
- `bmad/provider.py` swaps `FakeProvider` (no key) ↔ real Anthropic (`ANTHROPIC_MODEL`, default `claude-sonnet-5`).

## Migrations & deploy

- Migrations run at **container start** (`entrypoint.sh`: `alembic upgrade head`). This is single-replica only — move to a one-off job before scaling replicas > 1.
- After adding/changing a model, autogenerate a migration and review it; `migrations/env.py` imports `gigsnano_api.models` so the metadata is populated.
- Deploy: build `apps/api/Dockerfile`; any container host + Postgres 16 works. Pass secrets as environment variables (never bake them into the image). The root `docker-compose.yml` is the reference self-host setup.

## Dev DB

Default `DATABASE_URL` is the local compose Postgres: `docker compose up -d db` from the repo root (host port 5433, user/pass/db `gigsnano`).

## Billing

`BILLING_ENABLED` (default `false`) gates the workspace wallet: when false, `ensure_positive_balance` is a no-op and `record_llm_usage` records cost without debiting. The hosted service sets it to `true`. Tests run with it `true` (see `tests/conftest.py`).
