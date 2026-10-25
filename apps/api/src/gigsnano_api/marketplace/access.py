"""Work-item access resolver — admits workspace members or scoped contractors."""

import enum
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.marketplace.subtree import story_in_cycle, story_in_subtree
from gigsnano_api.models import (
    Contract,
    ContractAccess,
    EContractStatus,
    EMemberStatus,
    Project,
    Story,
    WorkspaceMember,
)
from gigsnano_api.shared.context import ADMINS, user_is_project_member


class EWorkItemAccessLevel(str, enum.Enum):
    NONE = "none"
    MEMBER = "member"
    CONTRACTOR = "contractor"


@dataclass(frozen=True)
class WorkItemAccess:
    level: EWorkItemAccessLevel
    workspace_id: str | None = None
    contract_id: str | None = None


async def _load_story_project(db: AsyncSession, story_id: str) -> tuple[Story, Project] | None:
    story = await db.get(Story, story_id)
    if story is None:
        return None
    project = await db.get(Project, story.project_id)
    if project is None:
        return None
    return story, project


async def _active_membership(
    db: AsyncSession, workspace_id: str, user_id: str
) -> WorkspaceMember | None:
    return (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()


async def _project_stories(db: AsyncSession, project_id: str) -> list[Story]:
    return list(
        (
            await db.execute(select(Story).where(Story.project_id == project_id))
        ).scalars()
    )


def _access_covers_story(
    access: ContractAccess,
    story_id: str,
    stories: list[Story],
) -> bool:
    if access.root_story_id is not None:
        return story_in_subtree(story_id, access.root_story_id, stories)
    if access.root_cycle_id is not None:
        story = next((s for s in stories if s.id == story_id), None)
        return story is not None and story_in_cycle(story, access.root_cycle_id)
    return False


async def resolve_work_item_access(
    db: AsyncSession,
    user_id: str,
    story_id: str,
) -> WorkItemAccess:
    """Single authorization seam for story-scoped endpoints. Fails closed."""
    loaded = await _load_story_project(db, story_id)
    if loaded is None:
        return WorkItemAccess(level=EWorkItemAccessLevel.NONE)

    _story, project = loaded
    workspace_id = project.workspace_id

    membership = await _active_membership(db, workspace_id, user_id)
    if membership is not None and (
        membership.role in ADMINS
        or await user_is_project_member(db, user_id, project.id)
    ):
        return WorkItemAccess(
            level=EWorkItemAccessLevel.MEMBER,
            workspace_id=workspace_id,
        )

    rows = (
        await db.execute(
            select(ContractAccess, Contract)
            .join(Contract, Contract.id == ContractAccess.contract_id)
            .where(
                ContractAccess.user_id == user_id,
                ContractAccess.active.is_(True),
                Contract.workspace_id == workspace_id,
                Contract.status == EContractStatus.IN_PROGRESS,
            )
        )
    ).all()

    if not rows:
        return WorkItemAccess(level=EWorkItemAccessLevel.NONE)

    stories = await _project_stories(db, project.id)
    for access, contract in rows:
        if _access_covers_story(access, story_id, stories):
            return WorkItemAccess(
                level=EWorkItemAccessLevel.CONTRACTOR,
                workspace_id=workspace_id,
                contract_id=contract.id,
            )

    return WorkItemAccess(level=EWorkItemAccessLevel.NONE)
