"""Triage + Customer persistence and the accept→Story publish (GIN-213/215).

Accept is the one-step-staffing seam: publish the enriched draft into a real Story
via the shared `_insert_story` core, then route it — assign an AI persona (and
start a live run via `coordinate`), assign a team member, or leave it for the
marketplace staff-this flow (GIN-187)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.features.task_router.coordinator import coordinate
from gigsnano_api.models import Project, Story
from gigsnano_api.models.agent_runs import AgentRun, EAgentAutonomy
from gigsnano_api.models.intake import Customer, ETriageSource, ETriageStatus, TriageItem
from gigsnano_api.models.stories import EStoryPriority, EStoryStatus, EStoryType

# classifier task_type → Story type (only bug/feature map cleanly; the rest are Stories).
_TASK_TYPE_TO_STORY = {"bug": EStoryType.BUG, "feature": EStoryType.FEATURE}


async def list_customers(db: AsyncSession, workspace_id: str) -> list[Customer]:
    rows = await db.execute(
        select(Customer).where(Customer.workspace_id == workspace_id).order_by(Customer.name)
    )
    return list(rows.scalars().all())


async def create_customer(db: AsyncSession, *, workspace_id: str, actor_id: str, **fields) -> Customer:
    customer = Customer(workspace_id=workspace_id, created_by_id=actor_id, **fields)
    db.add(customer)
    await db.flush()
    return customer


async def capture(
    db: AsyncSession, *, workspace_id: str, source: ETriageSource, title: str, body: str,
    is_public: bool, project_id: str | None = None, customer_id: str | None = None,
    created_by_id: str | None = None,
) -> TriageItem:
    item = TriageItem(
        workspace_id=workspace_id, source=source, title=title[:300], body=body,
        is_public=is_public, project_id=project_id, customer_id=customer_id,
        created_by_id=created_by_id, status=ETriageStatus.NEW,
    )
    db.add(item)
    await db.flush()
    return item


async def list_triage(db: AsyncSession, workspace_id: str, *, viewer_id: str) -> list[TriageItem]:
    """Open triage items (new/triaged). Private items are visible only to their
    capturer; everything else is workspace-visible."""
    rows = await db.execute(
        select(TriageItem)
        .where(
            TriageItem.workspace_id == workspace_id,
            TriageItem.status.in_([ETriageStatus.NEW, ETriageStatus.TRIAGED]),
        )
        .order_by(TriageItem.created_at.desc())
    )
    items = list(rows.scalars().all())
    return [i for i in items if i.is_public or i.created_by_id == viewer_id]


async def customer_weight(db: AsyncSession, item: TriageItem) -> int:
    if not item.customer_id:
        return 0
    customer = await db.get(Customer, item.customer_id)
    return customer.priority_weight if customer else 0


async def accept(
    db: AsyncSession, item: TriageItem, project: Project, actor, *,
    route: str | None, assignee_id: str | None, status: str,
) -> tuple[Story, AgentRun | None]:
    """Publish the triage item into a Story and route it. Returns (story, run|None);
    a run is created only when route == 'persona'. Caller commits + dispatches."""
    from gigsnano_api.features.stories.service import _insert_story

    route = route or (item.recommended_route or {}).get("route") or "persona"
    task_type = (item.classification or {}).get("task_type", "")
    fields: dict = {
        "title": (item.enriched_title or item.title)[:300],
        "description": item.enriched_description or item.body,
        "status": EStoryStatus(status),
        "priority": EStoryPriority(item.priority or "medium"),
        "type": _TASK_TYPE_TO_STORY.get(task_type, EStoryType.STORY),
    }
    if route == "team" and assignee_id:
        fields["assignee_id"] = assignee_id
    elif route == "persona":
        fields["ai_agent_id"] = (item.recommended_route or {}).get("persona_id")

    story = await _insert_story(db, project, actor, fields)

    run: AgentRun | None = None
    if route == "persona":
        run, _routing = await coordinate(db, story, project.workspace_id, EAgentAutonomy.DRAFT)

    item.status = ETriageStatus.ACCEPTED
    item.created_story_id = story.id
    await db.flush()
    return story, run
