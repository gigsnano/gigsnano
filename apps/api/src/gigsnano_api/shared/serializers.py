"""ORM → contract-shape serializers. All derived fields are computed here."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from gigsnano_api.bmad.unlock import rollup_progress, sprint_zero_status
from gigsnano_api.content import doc_to_markdown
from gigsnano_api.content.fields import read_content
from gigsnano_api.core.config import settings
from gigsnano_api.features.cycles.schemas import CycleOut
from gigsnano_api.features.members.schemas import MemberPreviewOut
from gigsnano_api.features.modules.schemas import ModuleOut
from gigsnano_api.features.projects.schemas import ProjectOut
from gigsnano_api.features.stories.labels import load_story_label_ids
from gigsnano_api.features.stories.schemas import StoryBmadOut, StoryOut
from gigsnano_api.models import (
    Cycle,
    ECustomFieldType,
    EMemberStatus,
    EStoryStatus,
    Module,
    Project,
    ProjectCustomField,
    ProjectMember,
    Story,
    StoryCustomFieldValue,
)

MEMBER_PREVIEW_CAP = 5


async def sub_issue_counts(db: AsyncSession, story_ids: list[str]) -> dict[str, int]:
    if not story_ids:
        return {}
    rows = await db.execute(
        select(Story.parent_id, func.count())
        .where(Story.parent_id.in_(story_ids))
        .group_by(Story.parent_id)
    )
    return dict(rows.all())


def _coerce_custom_value(value: str, field_type: ECustomFieldType) -> object:
    if field_type == ECustomFieldType.NUMBER:
        as_float = float(value)
        return int(as_float) if as_float.is_integer() else as_float
    return value


async def load_custom_values(
    db: AsyncSession, story_ids: list[str]
) -> dict[str, dict[str, object]]:
    """One query joining story custom-field values with their field's type, keyed
    `{story_id: {field_id: coerced_value}}`. Rows with a NULL value are skipped."""
    if not story_ids:
        return {}
    rows = await db.execute(
        select(
            StoryCustomFieldValue.story_id,
            StoryCustomFieldValue.field_id,
            StoryCustomFieldValue.value,
            ProjectCustomField.field_type,
        )
        .join(ProjectCustomField, ProjectCustomField.id == StoryCustomFieldValue.field_id)
        .where(StoryCustomFieldValue.story_id.in_(story_ids))
    )
    result: dict[str, dict[str, object]] = {}
    for story_id, field_id, value, field_type in rows.all():
        if value is None:
            continue
        result.setdefault(story_id, {})[field_id] = _coerce_custom_value(value, field_type)
    return result


def _describe(story: Story, want_format: str) -> tuple[str, str]:
    """Resolve a story's description plus an honest label for what it is (GIN-304).

    Markdown is served only when there is a canonical copy to serve it from.
    Editor-authored rows have no canonical copy until GIN-308 backfills, and
    there is deliberately no HTML -> Markdown converter — so asking for Markdown
    is a preference, not a guarantee, and the returned `content_format` says
    which one the caller actually got rather than what it asked for.
    """
    resolved = read_content(
        story.description_json, story.description, read_json=settings.content_json_read
    )
    if want_format == "markdown" and resolved.doc is not None:
        return doc_to_markdown(resolved.doc), "markdown"
    return resolved.html, "html"


def serialize_story(
    story: Story,
    workspace_slug: str,
    sub_counts: dict[str, int],
    identifier: str,
    custom_values: dict[str, dict[str, object]] | None = None,
    want_format: str = "html",
    label_ids: dict[str, list[str]] | None = None,
) -> StoryOut:
    bmad = None
    if story.bmad_workflow is not None:
        bmad = StoryBmadOut(
            workflow=story.bmad_workflow,
            agent=story.bmad_agent or "",
            artifact=story.bmad_artifact or "",
            is_locked=story.bmad_is_locked,
            is_required=story.bmad_is_required,
            skipped=story.bmad_skipped,
            readiness_result=story.bmad_readiness_result,
        )
    description, content_format = _describe(story, want_format)
    story_labels = (label_ids or {}).get(story.id, [])
    return StoryOut(
        id=story.id,
        story_number=story.story_number,
        code=(f"{identifier}-{story.story_number}" if story.story_number is not None else None),
        workspace_slug=workspace_slug,
        project_id=story.project_id,
        cloned_from_id=story.cloned_from_id,
        cycle_id=story.cycle_id,
        module_id=story.module_id,
        parent_id=story.parent_id,
        title=story.title,
        description=description,
        content_format=content_format,
        status=story.status,
        priority=story.priority,
        type=story.type,
        start_date=story.start_date,
        target_date=story.target_date,
        order=story.sort_order,
        assignee_id=story.assignee_id,
        ai_agent_id=story.ai_agent_id,
        label_ids=story_labels,
        # Deprecated singular, derived — see StoryOut (GIN-475).
        label_id=story_labels[0] if story_labels else None,
        estimate_id=story.estimate_id,
        estimate_points=story.estimate_points,
        size=story.size,
        duration_minutes=story.duration_minutes,
        sub_issue_count=sub_counts.get(story.id, 0),
        bmad=bmad,
        custom_fields=(custom_values or {}).get(story.id, {}),
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


async def serialize_stories(
    db: AsyncSession, stories: list[Story], workspace_slug: str, want_format: str = "html"
) -> list[StoryOut]:
    counts = await sub_issue_counts(db, [s.id for s in stories])
    custom_values = await load_custom_values(db, [s.id for s in stories])
    labels = await load_story_label_ids(db, [s.id for s in stories])
    ids = {s.project_id for s in stories}
    idents = dict(
        (await db.execute(select(Project.id, Project.identifier).where(Project.id.in_(ids)))).all()
    )
    return [
        serialize_story(
            s, workspace_slug, counts, idents.get(s.project_id, ""),
            custom_values=custom_values, want_format=want_format, label_ids=labels,
        )
        for s in stories
    ]


async def _sprint_zero_stories(db: AsyncSession, project_id: str) -> list[Story]:
    result = await db.execute(
        select(Story)
        .where(Story.project_id == project_id, Story.bmad_workflow.is_not(None))
        .order_by(Story.sort_order)
    )
    return list(result.scalars().all())


async def serialize_project(db: AsyncSession, project: Project, workspace_slug: str) -> ProjectOut:
    members = (
        (
            await db.execute(
                select(ProjectMember)
                .options(selectinload(ProjectMember.user))
                .where(
                    ProjectMember.project_id == project.id,
                    ProjectMember.status == EMemberStatus.ACTIVE,
                )
                .order_by(ProjectMember.created_at)
            )
        )
        .scalars()
        .all()
    )
    s0 = await _sprint_zero_stories(db, project.id)
    return ProjectOut(
        id=project.id,
        workspace_slug=workspace_slug,
        name=project.name,
        identifier=project.identifier,
        cover_image_url=project.cover_image_url,
        logo_emoji=project.logo_emoji,
        logo_color=project.logo_color,
        logo_image_url=project.logo_image_url,
        start_date=project.start_date,
        target_date=project.target_date,
        description=project.description,
        overview=project.overview,
        lead_id=project.lead_id,
        member_count=len(members),
        members=[
            MemberPreviewOut(
                id=m.user_id, display_name=m.user.display_name, avatar_url=m.user.avatar_url
            )
            for m in members[:MEMBER_PREVIEW_CAP]
        ],
        flow=project.flow,
        has_ui=project.has_ui,
        planning_method=project.planning_method.value,
        planning_method_updated_at=project.planning_method_updated_at,
        sprint_zero_status=sprint_zero_status(s0),
        sprint_zero_progress=rollup_progress(s0),
        repo_full_name=project.repo_full_name,
        repo_default_branch=project.repo_default_branch,
        clone_status=project.clone_status.value,
        clone_error=project.clone_error,
        index_status=project.index_status.value,
        index_error=project.index_error,
        indexed_commit_sha=project.indexed_commit_sha,
        indexed_at=project.indexed_at,
        solution_key=project.solution_key or "software_delivery",
        solution_version=(
            project.solution_version
            if project.solution_version is not None
            else 1
        ),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


async def serialize_projects(
    db: AsyncSession, projects: list[Project], workspace_slug: str
) -> list[ProjectOut]:
    return [await serialize_project(db, p, workspace_slug) for p in projects]


async def _cycle_story_counts(db: AsyncSession, cycle_id: str) -> tuple[int, int]:
    total = (
        await db.execute(select(func.count()).select_from(Story).where(Story.cycle_id == cycle_id))
    ).scalar_one()
    done = (
        await db.execute(
            select(func.count())
            .select_from(Story)
            .where(Story.cycle_id == cycle_id, Story.status == EStoryStatus.DONE)
        )
    ).scalar_one()
    return total, done


async def serialize_cycle(db: AsyncSession, cycle: Cycle, workspace_slug: str) -> CycleOut:
    total, done = await _cycle_story_counts(db, cycle.id)
    return CycleOut(
        id=cycle.id,
        workspace_slug=workspace_slug,
        project_id=cycle.project_id,
        name=cycle.name,
        description=cycle.description,
        status=cycle.status,
        is_sprint_zero=cycle.is_sprint_zero,
        start_date=cycle.start_date,
        end_date=cycle.end_date,
        story_count=total,
        completed_story_count=done,
        created_at=cycle.created_at,
        updated_at=cycle.updated_at,
    )


async def serialize_module(db: AsyncSession, module: Module, workspace_slug: str) -> ModuleOut:
    total = (
        await db.execute(
            select(func.count()).select_from(Story).where(Story.module_id == module.id)
        )
    ).scalar_one()
    done = (
        await db.execute(
            select(func.count())
            .select_from(Story)
            .where(Story.module_id == module.id, Story.status == EStoryStatus.DONE)
        )
    ).scalar_one()
    return ModuleOut(
        id=module.id,
        workspace_slug=workspace_slug,
        project_id=module.project_id,
        name=module.name,
        description=module.description,
        status=module.status,
        lead_id=module.lead_id,
        start_date=module.start_date,
        target_date=module.target_date,
        color=module.color,
        story_count=total,
        completed_story_count=done,
        created_at=module.created_at,
        updated_at=module.updated_at,
    )
