"""Load a project's SDLC rows from Postgres into the pure builder's shape. GIA-15."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.context_engine.graph.sdlc import SdlcRows
from gigsnano_api.models.artifacts import Artifact
from gigsnano_api.models.cycles import Cycle
from gigsnano_api.models.projects import Project
from gigsnano_api.models.stories import Story


async def load_sdlc(db: AsyncSession, project_id: str) -> SdlcRows:
    proj = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    identifier = proj.identifier if proj and proj.identifier else "ITEM"

    stories = (await db.execute(select(Story).where(Story.project_id == project_id))).scalars().all()
    cycles = (await db.execute(select(Cycle).where(Cycle.project_id == project_id))).scalars().all()
    artifacts = (await db.execute(select(Artifact).where(Artifact.project_id == project_id))).scalars().all()

    story_rows = [
        {
            "id": s.id,
            "code": f"{identifier}-{s.story_number}" if s.story_number is not None else s.id,
            "title": s.title,
            "type": s.type.value if s.type else "story",
            "parent_id": s.parent_id,
            "cycle_id": s.cycle_id,
        }
        for s in stories
    ]
    cycle_rows = [{"id": c.id, "name": c.name} for c in cycles]
    artifact_rows = [
        {"id": a.id, "doc_type": a.doc_type, "title": a.title, "source_story_id": a.source_story_id}
        for a in artifacts
    ]
    return SdlcRows(stories=story_rows, cycles=cycle_rows, artifacts=artifact_rows)


def story_code_to_id(rows: SdlcRows) -> dict[str, str]:
    """Map each story's human code (e.g. GIN-84) → its uuid, for commit linking."""
    return {s["code"]: str(s["id"]) for s in rows.stories if s.get("code")}
