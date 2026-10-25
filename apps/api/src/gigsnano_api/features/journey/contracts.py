"""Journey design-contract store (GIN-431 Experience, GIN-430 Topology).

Persists a surface's structured contract (Experience Contract / Solution
Topology) as the owning step's `Artifact.structured_json` under a dedicated
doc_type — reusing the artifacts table, no new schema, no collision with the
BMAD markdown `ux`/`architecture` artifacts. The contract JSON shape is owned by
the frontend; the backend stores it opaquely and upserts the latest row.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Artifact, EArtifactStatus, Project, Story


async def _latest(db: AsyncSession, project_id: str, doc_type: str) -> Artifact | None:
    return (
        await db.execute(
            select(Artifact)
            .where(Artifact.project_id == project_id, Artifact.doc_type == doc_type)
            .order_by(Artifact.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def get_contract(db: AsyncSession, project: Project, doc_type: str) -> dict | None:
    art = await _latest(db, project.id, doc_type)
    return art.structured_json if art is not None else None


async def put_contract(
    db: AsyncSession, project: Project, doc_type: str, source_workflow: str, contract: dict
) -> dict:
    """Upsert the latest contract row for this doc_type (editor save = overwrite,
    not a new version each keystroke)."""
    art = await _latest(db, project.id, doc_type)
    if art is not None:
        art.structured_json = contract
    else:
        story = (
            await db.execute(
                select(Story).where(
                    Story.project_id == project.id, Story.bmad_workflow == source_workflow
                )
            )
        ).scalars().first()
        db.add(
            Artifact(
                project_id=project.id,
                doc_type=doc_type,
                source_workflow=source_workflow,
                version=1,
                title=doc_type.replace("_", " ").title(),
                content_md="",
                structured_json=contract,
                status=EArtifactStatus.FINAL,
                source_story_id=story.id if story else None,
            )
        )
    await db.commit()
    return contract


__all__ = ["get_contract", "put_contract"]
