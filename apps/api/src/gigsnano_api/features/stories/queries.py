"""Story list/search query building: filters, ordering, paging and ranking.

Pure SQLAlchemy construction — no routes, no side effects — so the list endpoints
and the saved-view (GigSQL) path share one definition of what a filter means."""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import String, and_, case, cast, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.pagination import OffsetPageOut
from gigsnano_api.features.stories.schemas import (
    StoryOut,
)
from gigsnano_api.features.views.gigsql import parse_gigsql
from gigsnano_api.features.views.gigsql_sql import build_story_gigsql_predicate
from gigsnano_api.models import (
    EStoryPriority,
    EStoryStatus,
    EStoryType,
    Story,
    StoryLabel,
)
from gigsnano_api.shared.serializers import (
    serialize_stories,
)

_MAX_PAGE = 200


def _clamp_page(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, _MAX_PAGE)), max(0, offset)


def _esc_like(term: str) -> str:
    """Escape LIKE wildcards so a user term matches literally — a query containing
    % or _ must not become a wildcard."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _code_sql(ident_sql):
    """SQL for a story's work-item code, lowercased (e.g. 'gin-309'). The code is
    computed (identifier + '-' + story_number), not a stored column — which is why
    the old title/description-only search never matched an exact code."""
    return func.lower(ident_sql + literal("-") + cast(Story.story_number, String))


def _search_clause(q: str | None, ident_sql):
    """Global-search predicate for `q` (GIN-35, GIN-365): every whitespace term
    must match the work-item code, title OR description (AND across terms, OR across
    fields). Term-splitting is what gives multi-word queries like 'workspace
    isolation' the recall the old single-substring ILIKE lacked; the code arm is
    what makes an exact-code search like 'GIN-309' find its item. None when blank.

    ponytail: description is HTML, so a term can match inside markup — acceptable
    for search; swap for a stripped/indexed column or FTS if tag-text false
    positives ever matter."""
    if not q or not q.strip():
        return None
    code_sql = _code_sql(ident_sql)
    conds = []
    for term in q.split():
        like = f"%{_esc_like(term.lower())}%"
        conds.append(
            or_(
                func.lower(Story.title).like(like, escape="\\"),
                func.lower(Story.description).like(like, escape="\\"),
                code_sql.like(like, escape="\\"),
            )
        )
    return and_(*conds)


def _search_rank(q: str, ident_sql):
    """Relevance order for a search hit (GIN-365): exact code first, then exact
    title, title-prefix, title-substring, and finally description/term-only matches.
    Lower is better; the caller adds a deterministic tie-break (created_at, id)."""
    ql = q.strip().lower()
    like_ql = _esc_like(ql)
    title = func.lower(Story.title)
    return case(
        (_code_sql(ident_sql) == ql, 0),
        (title == ql, 1),
        (title.like(f"{like_ql}%", escape="\\"), 2),
        (title.like(f"%{like_ql}%", escape="\\"), 3),
        else_=4,
    )


async def _story_page(
    db: AsyncSession,
    list_stmt,
    count_stmt,
    workspace_slug: str,
    limit: int,
    offset: int,
) -> OffsetPageOut[StoryOut]:
    total = int((await db.scalar(count_stmt)) or 0)
    rows = list((await db.execute(list_stmt.limit(limit).offset(offset))).scalars().all())
    items = await serialize_stories(db, rows, workspace_slug)
    return OffsetPageOut(items=items, total=total, limit=limit, offset=offset)


def _parse_csv(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _apply_project_story_filters(
    list_stmt,
    count_stmt,
    *,
    identifier: str,
    product_only: bool,
    unassigned: bool,
    unassigned_only: bool,
    status: EStoryStatus | None,
    status_in: str | None,
    priority_in: str | None,
    type_in: str | None,
    cycle_id: str | None,
    module_id: str | None,
    assignee_id: str | None,
    label_id: str | None,
    q: str | None,
    target_date_from: str | None,
    target_date_to: str | None,
    scheduled_only: bool,
):
    if product_only:
        list_stmt = list_stmt.where(Story.bmad_workflow.is_(None))
        count_stmt = count_stmt.where(Story.bmad_workflow.is_(None))
    if unassigned or unassigned_only:
        list_stmt = list_stmt.where(Story.assignee_id.is_(None))
        count_stmt = count_stmt.where(Story.assignee_id.is_(None))
    if status is not None:
        list_stmt = list_stmt.where(Story.status == status)
        count_stmt = count_stmt.where(Story.status == status)
    statuses = [EStoryStatus(v) for v in _parse_csv(status_in)]
    if statuses:
        list_stmt = list_stmt.where(Story.status.in_(statuses))
        count_stmt = count_stmt.where(Story.status.in_(statuses))
    priorities = [EStoryPriority(v) for v in _parse_csv(priority_in)]
    if priorities:
        list_stmt = list_stmt.where(Story.priority.in_(priorities))
        count_stmt = count_stmt.where(Story.priority.in_(priorities))
    types = [EStoryType(v) for v in _parse_csv(type_in)]
    if types:
        list_stmt = list_stmt.where(Story.type.in_(types))
        count_stmt = count_stmt.where(Story.type.in_(types))
    if cycle_id:
        list_stmt = list_stmt.where(Story.cycle_id == cycle_id)
        count_stmt = count_stmt.where(Story.cycle_id == cycle_id)
    if module_id:
        list_stmt = list_stmt.where(Story.module_id == module_id)
        count_stmt = count_stmt.where(Story.module_id == module_id)
    if assignee_id:
        list_stmt = list_stmt.where(Story.assignee_id == assignee_id)
        count_stmt = count_stmt.where(Story.assignee_id == assignee_id)
    if label_id:
        # EXISTS, not equality: an item carrying this label plus others must still
        # match (GIN-475). `label_id` stays the query-param name for compatibility.
        has_label = (
            select(StoryLabel.id)
            .where(StoryLabel.story_id == Story.id, StoryLabel.label_id == label_id)
            .exists()
        )
        list_stmt = list_stmt.where(has_label)
        count_stmt = count_stmt.where(has_label)
    search = _search_clause(q, literal(identifier))
    if search is not None:
        list_stmt = list_stmt.where(search)
        count_stmt = count_stmt.where(search)
    parsed_from = _parse_query_date(target_date_from, field="target_date_from")
    if parsed_from is not None:
        list_stmt = list_stmt.where(Story.target_date.is_not(None), Story.target_date >= parsed_from)
        count_stmt = count_stmt.where(Story.target_date.is_not(None), Story.target_date >= parsed_from)
    parsed_to = _parse_query_date(target_date_to, field="target_date_to")
    if parsed_to is not None:
        list_stmt = list_stmt.where(Story.target_date.is_not(None), Story.target_date <= parsed_to)
        count_stmt = count_stmt.where(Story.target_date.is_not(None), Story.target_date <= parsed_to)
    if scheduled_only:
        list_stmt = list_stmt.where(Story.start_date.is_not(None), Story.target_date.is_not(None))
        count_stmt = count_stmt.where(Story.start_date.is_not(None), Story.target_date.is_not(None))
    return list_stmt, count_stmt


def _story_list_order(order_by: str):
    if order_by == "created":
        return Story.created_at.desc()
    if order_by == "updated":
        return Story.updated_at.desc()
    return Story.sort_order


def _parse_query_date(value: str | None, *, field: str) -> date | None:
    """Parse YYYY-MM-DD query params so Postgres date columns compare correctly."""
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field}: expected YYYY-MM-DD",
        ) from err


def _apply_story_gigsql(list_stmt, count_stmt, gigsql: str | None, user_id: str | None):
    """Parse GigsQL and AND its predicate onto story list/count statements."""
    if not gigsql or not gigsql.strip():
        return list_stmt, count_stmt
    try:
        node = parse_gigsql(gigsql.strip())
        predicate = build_story_gigsql_predicate(node, user_id)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(err),
        ) from err
    return list_stmt.where(predicate), count_stmt.where(predicate)


# UpdateStoryPayload fields that map straight onto Story columns.
