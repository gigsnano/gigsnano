"""Resolve a batch of work-item codes to rows (GIN-380/GIN-382).

Shared by every bulk endpoint so "which codes were bad, foreign or missing" is
answered identically everywhere — one query for the whole batch, and a per-item
reason for each code that did not resolve instead of failing the request.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Project, Story


async def resolve_codes(
    db: AsyncSession, project: Project, codes: list[str]
) -> tuple[dict[int, Story], dict[int, str], list[dict]]:
    """Returns (stories by number, code by number, failures).

    Failure reasons: `bad_code` (not IDENT-N), `cross_project` (another project's
    identifier), `not_found` (no such item, or it is in the trash).
    """
    wanted: dict[int, str] = {}
    failed: list[dict] = []
    for code in codes:
        identifier, _, num = code.rpartition("-")
        if not identifier or not num.isdigit():
            failed.append({"code": code, "error": "bad_code"})
        elif identifier.upper() != project.identifier.upper():
            failed.append({"code": code, "error": "cross_project"})
        else:
            wanted[int(num)] = code

    rows = (
        (
            await db.execute(
                select(Story).where(
                    Story.project_id == project.id,
                    Story.story_number.in_(list(wanted) or [-1]),
                )
            )
        )
        .scalars()
        .all()
    )
    found = {s.story_number: s for s in rows if s.story_number is not None}
    failed += [
        {"code": code, "error": "not_found"} for num, code in wanted.items() if num not in found
    ]
    return found, wanted, failed
