"""Materialize the docs tree from Postgres artifacts (spec §6).

Pure rendering: the folder tree is an EXPORT FORMAT — only generated docs ever
reach the user's repo."""

import re

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import (
    Artifact,
    EArtifactStatus,
    EStoryType,
    Project,
    Story,
)

SIMPLE_DOCS = {
    "brief": "docs/brief.md",
    "prd": "docs/prd.md",
    "architecture": "docs/architecture.md",
    "research": "docs/research.md",
    "project_context": "docs/project-context.md",
    "document_project": "docs/project-documentation.md",
}


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)[:60].rstrip("-")


def split_ux(markdown: str) -> tuple[str, str]:
    lines = markdown.splitlines()
    for i, line in enumerate(lines):
        if line.lstrip().startswith("#") and "experience" in line.lower():
            return "\n".join(lines[:i]).rstrip() + "\n", "\n".join(lines[i:]) + "\n"
    stub = "See design.md — the experience spec was not split out for this project.\n"
    return markdown, stub


def render_sprint_status(plan_json: dict, stories_by_id: dict[str, Story]) -> str:
    assigned: set[str] = set()
    sprints = []
    for sprint in plan_json.get("sprints", []):
        entries = []
        for sid in sprint.get("story_ids", []):
            story = stories_by_id.get(sid)
            if story is None:
                continue
            assigned.add(sid)
            entries.append(
                {"id": story.id, "title": story.title, "status": story.status.value}
            )
        sprints.append({"name": sprint.get("name", "Sprint"), "stories": entries})
    backlog = [
        {"id": s.id, "title": s.title, "status": s.status.value}
        for sid, s in stories_by_id.items()
        if sid not in assigned
    ]
    return yaml.safe_dump(
        {"generated_by": "GigsNano", "sprints": sprints, "backlog": backlog},
        sort_keys=False,
        allow_unicode=True,
    )


async def _latest_finals(db: AsyncSession, project_id: str) -> dict[str, Artifact]:
    artifacts = (
        await db.execute(
            select(Artifact)
            .where(
                Artifact.project_id == project_id,
                Artifact.status == EArtifactStatus.FINAL,
            )
            .order_by(Artifact.doc_type, Artifact.version)
        )
    ).scalars()
    latest: dict[str, Artifact] = {}
    for artifact in artifacts.all():
        latest[artifact.doc_type] = artifact  # later versions overwrite earlier
    return latest


async def materialize(db: AsyncSession, project: Project) -> dict[str, str]:
    latest = await _latest_finals(db, project.id)
    files: dict[str, str] = {}

    for doc_type, path in SIMPLE_DOCS.items():
        if doc_type in latest:
            files[path] = latest[doc_type].content_md

    if "ux" in latest:
        design, experience = split_ux(latest["ux"].content_md)
        files["docs/design.md"] = design
        files["docs/experience.md"] = experience

    product_stories = (
        (
            await db.execute(
                select(Story)
                .where(Story.project_id == project.id, Story.bmad_workflow.is_(None))
                .order_by(Story.sort_order)
            )
        )
        .scalars()
        .all()
    )
    by_parent: dict[str, list[Story]] = {}
    for story in product_stories:
        if story.parent_id:
            by_parent.setdefault(story.parent_id, []).append(story)

    epic_index = 0
    for epic_story in product_stories:
        if epic_story.type != EStoryType.EPIC:
            continue
        epic_index += 1
        body = [
            f"# Epic {epic_index}: {epic_story.title}",
            "",
            epic_story.description,
            "",
        ]
        for child in by_parent.get(epic_story.id, []):
            if child.type != EStoryType.STORY:
                continue
            check = "x" if child.status.value == "done" else " "
            body.append(f"- [{check}] {child.title}")
        files[f"docs/epics/epic-{epic_index}-{slugify(epic_story.title)}.md"] = (
            "\n".join(body).rstrip() + "\n"
        )

    for doc_type, artifact in latest.items():
        if doc_type == "story_file":
            files[f"docs/stories/story-{slugify(artifact.title)}.md"] = artifact.content_md

    if "sprint_plan" in latest and latest["sprint_plan"].structured_json:
        files["docs/sprint-status.yaml"] = render_sprint_status(
            latest["sprint_plan"].structured_json,
            {s.id: s for s in product_stories},
        )

    return files
