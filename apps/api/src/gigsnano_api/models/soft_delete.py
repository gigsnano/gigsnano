"""Global soft-delete filter for Story (GIN-97).

Registering `with_loader_criteria` on the session's `do_orm_execute` event adds
`Story.deleted_at IS NULL` to every ORM SELECT touching Story — the one choke
point that keeps trashed items out of lists, boards, counts, analytics, search,
exports, sub-issue counts, etc. without editing each of the ~15 query sites.

Opt out (trash list / restore / purge) with `.execution_options(include_deleted=True)`.
The filter is scoped to SELECTs, so UPDATE/DELETE statements (soft-delete,
restore, purge) are never touched and need no opt-out.
"""
from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from gigsnano_api.models.stories import Story


@event.listens_for(Session, "do_orm_execute")
def _exclude_soft_deleted(state: ORMExecuteState) -> None:
    if (
        state.is_select
        and not state.is_column_load
        and not state.is_relationship_load
        and not state.execution_options.get("include_deleted", False)
    ):
        state.statement = state.statement.options(
            with_loader_criteria(
                Story, lambda cls: cls.deleted_at.is_(None), include_aliases=True
            )
        )
