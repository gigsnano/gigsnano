# GigsNano API

FastAPI + async SQLAlchemy backend for GigsNano: the project-management domain API and the BMAD agent orchestration (chat over SSE, finalize → versioned artifacts, Sprint-0 unlock rules). Python 3.12, managed with [uv](https://docs.astral.sh/uv/).

## Run

```bash
docker compose up -d db        # from the repo root: Postgres on :5433
cp .env.example .env           # defaults already point at that database
uv sync
uv run alembic upgrade head
uv run uvicorn gigsnano_api.app:app --reload --port 8020
```

- OpenAPI docs: <http://localhost:8020/docs>
- Health: <http://localhost:8020/health>

Port 8020 is what the web app expects (`NEXT_PUBLIC_API_BASE_URL=http://localhost:8020/api`).

In production use a random `JWT_SECRET` of at least 32 bytes and `COOKIE_SECURE=true`.

## Keyless by default

Every integration falls back to a fake when its config is empty, so the API runs with no accounts or keys:

| Integration | Enable with | Fake when empty |
|---|---|---|
| LLM (BMAD agents, GigsAI) | `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL` optional) | `FakeProvider` — canned streaming replies |
| GitHub | `GITHUB_OAUTH_CLIENTID`, `GITHUB_OAUTH_CLIENTSECRET` | simulated connect + clone |
| Email | `ACS_CONNECTION_STRING`, `EMAIL_FROM` | `FakeEmailProvider` |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `FakePaymentProvider` |
| Webhooks | `WEBHOOKS_REAL_DELIVERY=true` | `FakeWebhookSender` |

`BILLING_ENABLED` (default `false`) turns on the workspace wallet: AI calls require a positive balance and are charged to it. Self-hosted installs normally leave it off; usage is still recorded.

## Tests and lint

```bash
uv run pytest -q        # in-memory SQLite, no services needed
uv run ruff check .
uv run python scripts/python_doctor.py
```

`tests/known-failures.txt` lists tests that currently fail on `main`; CI deselects them until they are fixed.

## BMAD assets

Agent personas and workflows are vendored in `bmad_assets/` (version in `manifest.yaml`). Any content change needs a version bump, the full test suite and one manual Sprint-0 run.

## Deploying

Build `apps/api/Dockerfile`; the entrypoint runs `alembic upgrade head` and starts uvicorn on port 8000. Any container host plus Postgres 16 works — the root `docker-compose.yml` is the reference setup. Pass secrets as environment variables; never bake them into the image.
