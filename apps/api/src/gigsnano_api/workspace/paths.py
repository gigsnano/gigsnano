"""Per-project physical workspace paths with containment (spec §6.2).
Every filesystem op for a project MUST resolve through here — a project can
only ever touch its own <base>/<project_id> subtree."""

import re
from pathlib import Path

from gigsnano_api.core.config import settings

# Project ids must be a single opaque path segment (server-generated UUIDs
# match this). Whitelisting — rather than blacklisting traversal substrings —
# closes cases like a lone "." which resolves to the base dir itself.
_VALID_PROJECT_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def workspace_root(project_id: str) -> Path:
    base = Path(settings.workspace_base_path).expanduser().resolve()
    if not project_id or not _VALID_PROJECT_ID.match(project_id):
        raise ValueError(f"Illegal project id for workspace path: {project_id!r}")
    candidate = (base / project_id).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as err:
        raise ValueError(f"Workspace path escapes base: {candidate}") from err
    return candidate


def ensure_workspace(project_id: str) -> Path:
    root = workspace_root(project_id)
    root.mkdir(parents=True, exist_ok=True)
    return root


def index_dir(project_id: str) -> Path:
    """The per-project code-index output dir, always inside <base>/<project_id>."""
    return workspace_root(project_id) / ".graphify-index"


def ensure_index_dir(project_id: str) -> Path:
    d = index_dir(project_id)
    d.mkdir(parents=True, exist_ok=True)
    return d
