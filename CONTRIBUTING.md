# Contributing to GigsNano

Thanks for helping. This guide covers setup, the quality gates, and how changes get merged.

## Contributor License Agreement

Before your first pull request can be merged you must sign the CLA. The CLA bot comments on your PR with a link to [CLA.md](CLA.md); you sign by replying with the sentence it gives you. Signing takes a minute and covers all future contributions. You keep the copyright to your work. The CLA grants GigsNano the right to distribute your contribution under the AGPL and under other licenses, which is what lets us offer the hosted service and the mobile app alongside the open-source project.

## Setup

Requirements: Node 22, pnpm 10 (`corepack enable`), Python 3.12, [uv](https://docs.astral.sh/uv/), Docker.

```bash
pnpm install
docker compose up -d db
cd apps/api && uv sync && uv run alembic upgrade head && cd ../..
```

Run the API (`cd apps/api && uv run uvicorn gigsnano_api.app:app --reload --port 8020`) and the web app (`pnpm dev`). Everything works without API keys — see the README for optional providers.

## Tests and checks

| Area | Command |
|---|---|
| Web | `pnpm --filter @gigsnano/web test` |
| Core / MCP | `pnpm --filter @gigsnano/core test`, `pnpm --filter @gigsnano/mcp test` |
| API | `cd apps/api && uv run pytest` |
| API lint | `cd apps/api && uv run ruff check <changed files>` (main has known pre-existing findings) |
| React rules | `pnpm --filter @gigsnano/web doctor` (react-doctor) |
| Python rules | `cd apps/api && uv run python scripts/python_doctor.py` (python-doctor) |

CI runs all of these. react-doctor and python-doctor only flag **new** findings in the lines you changed, so existing residue never blocks you.

Optional: `pre-commit install` runs ruff and python-doctor on staged backend files.

## Conventions

- Read `apps/web/CLAUDE.md` and `apps/api/CLAUDE.md` — they describe the architecture (three-layer frontend, mock seam, BMAD unlock rules) and are kept current. They are also what AI coding agents read.
- Tests sit next to the code they cover (`*.test.ts[x]` in the web app, `apps/api/tests/` for the backend).
- Keep the app keyless: any new external integration needs a fake provider used when its config is empty.
- Never use real company or customer names in fixtures, examples or docs.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …).

## Pull requests

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Branch from `main`, keep the PR focused, and fill in the PR template.
3. CI must be green and one maintainer must approve.

## Security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).
