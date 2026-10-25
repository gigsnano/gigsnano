"""Artifact library (GIN-194): loadable skills / design-systems / personas.

Built-ins are a static public shelf (this repo's own conventions + persona
roster); user-created artifacts live in the `foundation_artifacts` table with
private (workspace-scoped) or public visibility. A project loads artifacts into
its Foundation via `ProjectFoundation.pinned_artifacts` (a list of ids)."""

import re

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models.foundation import FoundationArtifact

ARTIFACT_TYPES = ("skill", "design_system", "persona")
VISIBILITIES = ("private", "public")

# Static public shelf — stable slug ids so pins survive without a DB seed.
BUILTIN_ARTIFACTS: list[dict] = [
    {"id": "skill:emil-design-eng", "artifact_type": "skill", "name": "emil-design-eng",
     "version": "1.0", "visibility": "public", "payload": "Component polish + invisible details."},
    {"id": "skill:transitions-dev", "artifact_type": "skill", "name": "transitions-dev",
     "version": "1.0", "visibility": "public", "payload": "Production-ready CSS transitions."},
    {"id": "skill:testing-tdd", "artifact_type": "skill", "name": "testing-tdd",
     "version": "1.0", "visibility": "public", "payload": "Test-driven development discipline."},
    {"id": "design_system:shadcn", "artifact_type": "design_system", "name": "shadcn/Tailwind",
     "version": "1.0", "visibility": "public", "payload": "shadcn CSS-var tokens + Tailwind."},
    {"id": "design_system:material", "artifact_type": "design_system", "name": "Material",
     "version": "1.0", "visibility": "public", "payload": "Material design system."},
    {"id": "persona:architect", "artifact_type": "persona", "name": "Architect",
     "version": "1.0", "visibility": "public", "payload": "System design + architecture persona."},
    {"id": "persona:developer", "artifact_type": "persona", "name": "Developer",
     "version": "1.0", "visibility": "public", "payload": "Implementation persona."},
    {"id": "persona:gigs-finance-expert", "artifact_type": "persona", "name": "gigs-finance-expert",
     "version": "1.0", "visibility": "public", "payload": "Domain expert: finance / payments / PCI."},
    {"id": "persona:gigs-health-expert", "artifact_type": "persona", "name": "gigs-health-expert",
     "version": "1.0", "visibility": "public", "payload": "Domain expert: health / HIPAA / clinical."},
    {"id": "persona:gigs-ecommerce-expert", "artifact_type": "persona", "name": "gigs-ecommerce-expert",
     "version": "1.0", "visibility": "public", "payload": "Domain expert: e-commerce / checkout / catalog."},
    {"id": "persona:gigs-data-expert", "artifact_type": "persona", "name": "gigs-data-expert",
     "version": "1.0", "visibility": "public", "payload": "Domain expert: data / analytics / pipelines."},
    {"id": "persona:gigs-platform-expert", "artifact_type": "persona", "name": "gigs-platform-expert",
     "version": "1.0", "visibility": "public",
     "payload": "Domain expert: platform / agent infrastructure / developer tooling."},
]

_DOMAIN_RE = re.compile(r"gigs-([a-z0-9]+)-expert")


def persona_domain(name: str) -> str | None:
    """The domain a `gigs-<domain>-expert` persona specializes in, else None."""
    m = _DOMAIN_RE.search(name.lower())
    return m.group(1) if m else None


def _row_to_dict(row: FoundationArtifact) -> dict:
    return {
        "id": row.id,
        "artifact_type": row.artifact_type,
        "name": row.name,
        "version": row.version,
        "visibility": row.visibility,
        "payload": row.payload,
    }


async def list_visible(
    db: AsyncSession, workspace_id: str, artifact_type: str | None = None
) -> list[dict]:
    """Built-in public shelf + DB artifacts that are public or owned by this
    workspace. Private artifacts of other workspaces are never returned."""
    stmt = select(FoundationArtifact).where(
        or_(
            FoundationArtifact.visibility == "public",
            FoundationArtifact.owner_workspace_id == workspace_id,
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    items = list(BUILTIN_ARTIFACTS) + [_row_to_dict(r) for r in rows]
    if artifact_type:
        items = [a for a in items if a["artifact_type"] == artifact_type]
    return items


async def create_artifact(
    db: AsyncSession,
    workspace_id: str,
    *,
    artifact_type: str,
    name: str,
    version: str | None,
    visibility: str,
    payload: str | None,
) -> dict:
    if artifact_type not in ARTIFACT_TYPES:
        raise ValueError(f"artifact_type must be one of {ARTIFACT_TYPES}")
    if visibility not in VISIBILITIES:
        raise ValueError(f"visibility must be one of {VISIBILITIES}")
    row = FoundationArtifact(
        artifact_type=artifact_type,
        name=name,
        version=version or "1.0",
        visibility=visibility,
        owner_workspace_id=workspace_id,
        payload=payload or "",
    )
    db.add(row)
    await db.flush()
    return _row_to_dict(row)


async def assert_pins_visible(db: AsyncSession, workspace_id: str, artifact_ids: list[str]) -> None:
    """Reject pinning an artifact the workspace can't see (unknown or another
    workspace's private one). Keeps visibility honest at load time."""
    visible = {a["id"] for a in await list_visible(db, workspace_id)}
    unknown = [i for i in artifact_ids if i not in visible]
    if unknown:
        raise ValueError(f"unknown or not-visible artifacts: {', '.join(unknown)}")
