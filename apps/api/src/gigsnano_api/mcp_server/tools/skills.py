"""Skill-registry tools (GIN-286): catalog, search and manifest lookup."""

from gigsnano_api.mcp_server.api import ApiError, TPayload, api, default_workspace, text
from gigsnano_api.mcp_server.server import mcp

# --- Skill registry catalog (GIN-286) ------------------------------------------


def _semver_key(version: str) -> tuple[int, ...]:
    """Sort key for a semver string. The registry validates versions as X.Y.Z at
    publish, so this parses cleanly; a non-numeric part sorts lowest defensively.
    Used to pick a deterministic "latest" — the registry list has no stable order."""
    try:
        return tuple(int(p) for p in version.split("."))
    except ValueError:
        return (-1,)


def _skill_summary(pkg: dict) -> dict:
    """Compact per-skill view — omit full manifests so a catalog listing does not
    drown the caller's context (get_skill_manifest returns the detail)."""
    return {
        "name": pkg["name"],
        "visibility": pkg["visibility"],
        "versions": [
            {"version": v["version"], "digest": v["digest"], "lifecycle": v["lifecycle"]}
            for v in pkg.get("versions", [])
        ],
    }


@mcp.tool(
    description=(
        "List the skills visible in the active workspace (public + this "
        "workspace's private) from the skill registry, with each version's digest "
        "and lifecycle. Read-only; returns no bundle content."
    )
)
async def list_skills() -> TPayload:
    slug = await default_workspace()
    rows = await api("GET", f"/workspaces/{slug}/skills/")
    return text([_skill_summary(p) for p in rows])


@mcp.tool(
    description=(
        "Search the workspace skill registry by text (matches a skill name or a "
        "version's manifest description). Returns the same shape as list_skills."
    )
)
async def search_skills(query: str) -> TPayload:
    slug = await default_workspace()
    rows = await api("GET", f"/workspaces/{slug}/skills/")
    q = query.lower()
    hits = [
        p
        for p in rows
        if q in p["name"].lower()
        or any(
            q in ((v.get("manifest") or {}).get("description") or "").lower()
            for v in p.get("versions", [])
        )
    ]
    return text([_skill_summary(p) for p in hits])


@mcp.tool(
    description=(
        "Fetch one skill version's manifest, digest, lifecycle, and authorized "
        "bundle URL (never the bundle bytes). Omit `version` for the latest "
        "non-revoked version. Use the digest to verify a materialized bundle."
    )
)
async def get_skill_manifest(skill: str, version: str | None = None) -> TPayload:
    slug = await default_workspace()
    rows = await api("GET", f"/workspaces/{slug}/skills/")
    pkg = next((p for p in rows if p["name"] == skill), None)
    if pkg is None:
        raise ApiError(404, f"skill {skill!r} not found")
    versions = pkg.get("versions", [])
    if version is not None:
        chosen = next((v for v in versions if v["version"] == version), None)
        if chosen is None:
            raise ApiError(404, f"skill {skill!r} has no version {version!r}")
    else:
        runnable = [v for v in versions if v["lifecycle"] != "revoked"]
        if not runnable:
            raise ApiError(404, f"skill {skill!r} has no runnable version")
        chosen = max(runnable, key=lambda v: _semver_key(v["version"]))
    return text(
        {
            "name": pkg["name"],
            "version": chosen["version"],
            "digest": chosen["digest"],
            "lifecycle": chosen["lifecycle"],
            "visibility": pkg["visibility"],
            "manifest": chosen.get("manifest") or {},
            "bundle_ref": f"/api/workspaces/{slug}/skills/versions/{chosen['id']}/bundle/",
        }
    )
