"""Impact analysis for a work item (GIN-200): affected code + related items + risk.

Graph-free by design: affected code comes from the project's clone via
``git log --grep=<code>`` (commits that reference the story code), and related
items come from explicit story relations + shared module + parent/children.
The Context-Engine code graph can later widen `affected` via call-graph
expansion — but this path works with just a clone, no FalkorDB.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.context_engine.parse.languages import detect
from gigsnano_api.models.stories import Story, StoryRelation
from gigsnano_api.workspace.paths import workspace_root

_CODE_RE = re.compile(r"\b([A-Z][A-Z0-9]+)-(\d+)\b")


def story_code(identifier: str, story_number: int | None) -> str:
    return f"{identifier}-{story_number}" if story_number is not None else identifier


def affected_files(repo_dir: Path | None, code: str, limit: int = 100) -> list[str]:
    """Source files touched by commits whose message references `code`. Empty when
    there's no clone / no matching commits. Only real source files (detect() != None)."""
    if repo_dir is None or not (repo_dir / ".git").exists():
        return []
    proc = subprocess.run(
        ["git", "log", f"--grep={code}", "--name-only", "--pretty=format:",
         f"--max-count={limit}"],
        cwd=str(repo_dir), capture_output=True, text=True, timeout=30, check=False,
    )
    if proc.returncode != 0:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for line in proc.stdout.splitlines():
        f = line.strip()
        if f and f not in seen and detect(f) is not None:
            seen.add(f)
            out.append(f)
    return out


def risk_band(n_files: int, n_related: int) -> dict:
    """Blast-radius risk from affected-file count + related-item coupling."""
    score = n_files * 3 + n_related * 5
    level = "high" if score >= 30 else "medium" if score >= 12 else "low"
    return {
        "level": level,
        "score": score,
        "rationale": f"{n_files} affected file(s), {n_related} related item(s)",
    }


async def _related_items(db: AsyncSession, project_identifier: str, story: Story) -> list[dict]:
    by_id: dict[str, str] = {}  # related story id -> reason

    rels = (
        await db.execute(
            select(StoryRelation).where(
                or_(
                    StoryRelation.story_id == story.id,
                    StoryRelation.related_story_id == story.id,
                )
            )
        )
    ).scalars().all()
    for r in rels:
        other = r.related_story_id if r.story_id == story.id else r.story_id
        by_id.setdefault(other, r.relation_type.value)

    # Parent is intentionally excluded — it's shown in the item header/breadcrumb,
    # so listing it here just duplicates structure. Sub-items stay (they carry an
    # unlink action in the Impact list).
    children = (
        await db.execute(select(Story).where(Story.parent_id == story.id))
    ).scalars().all()
    for c in children:
        by_id.setdefault(c.id, "sub-item")

    if story.module_id:
        siblings = (
            await db.execute(
                select(Story)
                .where(Story.module_id == story.module_id, Story.id != story.id)
                .limit(8)
            )
        ).scalars().all()
        for s in siblings:
            by_id.setdefault(s.id, "same module")

    if not by_id:
        return []
    rows = (
        await db.execute(select(Story).where(Story.id.in_(list(by_id))))
    ).scalars().all()
    return [
        {
            "id": s.id,
            "code": story_code(project_identifier, s.story_number),
            "title": s.title,
            "status": s.status,
            "priority": s.priority,
            "reason": by_id[s.id],
        }
        for s in rows
    ]


_FIB = [1, 2, 3, 5, 8, 13, 21]


def estimate_points(n_files: int, n_related: int, description_len: int) -> dict:
    """Grounded story-point estimate from the code/relation surface area."""
    raw = n_files * 2 + n_related + description_len // 400
    points = next((f for f in _FIB if f >= raw), _FIB[-1]) if raw > 0 else 1
    return {
        "points": points,
        "rationale": (
            f"{n_files} affected file(s), {n_related} related item(s), "
            f"~{description_len} chars of description"
        ),
    }


async def compute_estimate(db: AsyncSession, project, story: Story) -> dict:
    impact = await compute_impact(db, project, story)
    est = estimate_points(
        len(impact["affected_files"]),
        len(impact["related_items"]),
        len(story.description or ""),
    )
    return {"story_code": impact["story_code"], **est}


def _referenced_codes(identifier: str, description: str | None) -> set[int]:
    """Story numbers referenced in the description under this project's identifier."""
    if not description:
        return set()
    return {
        int(num)
        for pre, num in _CODE_RE.findall(description)
        if pre == identifier
    }


async def suggested_dependencies(db: AsyncSession, project, story: Story) -> list[dict]:
    """Evidence-backed relation suggestions (not yet linked): stories referenced in
    the description ("description overlap") and same-module siblings. The FE accepts
    one into the existing StoryRelation table."""
    linked = {
        (r.related_story_id if r.story_id == story.id else r.story_id)
        for r in (
            await db.execute(
                select(StoryRelation).where(
                    or_(
                        StoryRelation.story_id == story.id,
                        StoryRelation.related_story_id == story.id,
                    )
                )
            )
        ).scalars().all()
    }
    linked.add(story.id)

    candidates: dict[str, str] = {}  # story id -> evidence

    ref_numbers = _referenced_codes(project.identifier, story.description)
    if ref_numbers:
        for s in (
            await db.execute(
                select(Story).where(
                    Story.project_id == project.id, Story.story_number.in_(ref_numbers)
                )
            )
        ).scalars().all():
            if s.id not in linked:
                candidates.setdefault(s.id, "referenced in description")

    if story.module_id:
        for s in (
            await db.execute(
                select(Story)
                .where(Story.module_id == story.module_id, Story.id != story.id)
                .limit(8)
            )
        ).scalars().all():
            if s.id not in linked:
                candidates.setdefault(s.id, "same module")

    if not candidates:
        return []
    rows = (
        await db.execute(select(Story).where(Story.id.in_(list(candidates))))
    ).scalars().all()
    return [
        {
            "code": story_code(project.identifier, s.story_number),
            "title": s.title,
            "relation": "relates_to",
            "confidence": "high" if candidates[s.id] == "referenced in description" else "medium",
            "evidence": candidates[s.id],
        }
        for s in rows
    ]


async def compute_impact(db: AsyncSession, project, story: Story) -> dict:
    code = story_code(project.identifier, story.story_number)
    try:
        repo_dir = workspace_root(project.id)
    except ValueError:
        repo_dir = None
    files = affected_files(repo_dir if repo_dir and repo_dir.exists() else None, code)
    related = await _related_items(db, project.identifier, story)
    citations = [{"type": "file", "ref": f} for f in files]
    citations += [{"type": "item", "ref": r["code"]} for r in related]
    return {
        "story_code": code,
        "affected_files": files,
        "related_items": related,
        "risk": risk_band(len(files), len(related)),
        "citations": citations,
    }
