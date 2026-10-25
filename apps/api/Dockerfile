FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm
WORKDIR /app
# git for brownfield clones; Node + Sourcegraph SCIP indexers for the context-engine
# precise code graph (scip-python / scip-typescript resolve real call/inheritance edges).
# jscpd + scc + semgrep back the static metrics pass (workspace/metrics.py): without
# them _jscpd_duplication silently reported 0% for every repo and _scc_languages fell
# back to an 11-extension file scan. Each analyzer degrades independently, so a missing
# binary is invisible in the logs -- keep these installed.
#
# semgrep is a standalone TOOL here, not a project dependency: metrics.py only shells
# out to it, so it needs a CLI on PATH, not an import. Keeping it out of pyproject also
# keeps its large transitive tree (click/requests/rich/...) out of the app's resolution,
# and sidesteps the fact that it ships no Windows wheel and nothing for Python >= 3.14 --
# either of which makes `uv lock` unsolvable against requires-python = ">=3.12".
# Installed into the system python (not /app/.venv) so the two dependency sets can't
# collide; its CLI lands at /usr/local/bin/semgrep.
#
# setuptools<81 is explicit and the bound is load-bearing: semgrep's opentelemetry
# dependency imports pkg_resources, the slim base image no longer bundles setuptools
# at all, and setuptools >= 81 has *removed* pkg_resources -- so both a missing
# setuptools and a current one leave `semgrep --version` dying on
# ModuleNotFoundError while the image build itself still reports success. Revisit
# once semgrep's dependencies drop pkg_resources.
# Installed as root (before USER switch) so the npm global bins land on PATH.
ARG SCC_VERSION=3.7.0
ARG SEMGREP_VERSION=1.130.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @sourcegraph/scip-python @sourcegraph/scip-typescript jscpd \
    && npm cache clean --force \
    && curl -fsSL "https://github.com/boyter/scc/releases/download/v${SCC_VERSION}/scc_Linux_x86_64.tar.gz" \
        | tar -xz -C /usr/local/bin scc \
    && chmod +x /usr/local/bin/scc \
    && pip install --no-cache-dir "setuptools<81" "semgrep==${SEMGREP_VERSION}" \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home appuser
COPY --from=builder --chown=appuser:appuser /app /app
# Guarantee the exec bit regardless of the committed git file mode (Windows
# checkouts don't preserve it), since the exec-form ENTRYPOINT execve()s it.
RUN chmod +x /app/entrypoint.sh
# Brownfield clones mount a named volume here (docker-compose.yml). Create the dir
# owned by appuser BEFORE the USER switch so a fresh/empty named volume inherits
# that ownership (Docker seeds an empty volume from the image's dir). Otherwise the
# volume root is root-owned and appuser can't mkdir per-project clone dirs, which
# surfaces as `PermissionError: [Errno 13] Permission denied: '/workspaces/<id>'`
# in populate_workspace and fails every re-index.
RUN mkdir -p /workspaces && chown appuser:appuser /workspaces
USER appuser
ENV PATH="/app/.venv/bin:$PATH"
# Brownfield git clones write under this path (see docker-compose.yml).
ENV WORKSPACE_BASE_PATH=/workspaces
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
