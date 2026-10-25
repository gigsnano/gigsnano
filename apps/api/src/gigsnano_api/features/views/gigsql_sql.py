"""Compile GigsQL AST to SQLAlchemy predicates for Story queries (GIN-138)."""

from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.sql import func

from gigsnano_api.features.views.gigsql import (
    GigsQLBetween,
    GigsQLIn,
    GigsQLIsNull,
    GigsQLLogical,
    GigsQLNode,
    GigsQLPredicate,
    reject_code_analysis_domain,
)
from gigsnano_api.models import EStoryPriority, EStoryStatus, EStoryType, Story, StoryLabel

_SELECT_ENUMS: dict[str, type[EStoryStatus] | type[EStoryPriority] | type[EStoryType]] = {
    "status": EStoryStatus,
    "priority": EStoryPriority,
    "type": EStoryType,
}

_ID_COLUMNS = {
    "assignee": Story.assignee_id,
    "cycle": Story.cycle_id,
    "module": Story.module_id,
}

# `label` is many-to-many (GIN-475), so it is an EXISTS over `story_labels`
# rather than a column comparison: "label = X" must still match an item that
# carries X plus three others.
_LABEL_FIELD = "label"


def _has_label(label_ids: tuple[str, ...]) -> ColumnElement[bool]:
    return (
        select(StoryLabel.id)
        .where(StoryLabel.story_id == Story.id, StoryLabel.label_id.in_(label_ids))
        .exists()
    )

_DATE_COLUMNS = {
    "startDate": Story.start_date,
    "dueDate": Story.target_date,
}

_DATETIME_COLUMNS = {
    "createdAt": Story.created_at,
    "updatedAt": Story.updated_at,
}


def build_story_gigsql_predicate(
    node: GigsQLNode, user_id: str | None
) -> ColumnElement[bool]:
    """Translate a parsed GigsQL AST into a SQLAlchemy boolean expression on Story."""
    reject_code_analysis_domain(node)
    return _build(node, user_id)


def _build(node: GigsQLNode, user_id: str | None) -> ColumnElement[bool]:
    if isinstance(node, GigsQLLogical):
        parts = [_build(child, user_id) for child in node.children]
        return and_(*parts) if node.kind == "AND" else or_(*parts)

    if isinstance(node, GigsQLIsNull):
        return _null_predicate(node.field)

    if isinstance(node, GigsQLIn):
        return _in_predicate(node.field, node.values, node.negated, user_id)

    if isinstance(node, GigsQLBetween):
        return _between_predicate(node.field, node.start, node.end)

    if isinstance(node, GigsQLPredicate):
        return _predicate(node.field, node.operator, node.value, user_id)

    raise TypeError(f"Unsupported AST node: {type(node)!r}")


def _null_predicate(field: str) -> ColumnElement[bool]:
    if field == _LABEL_FIELD:
        # "no label at all" — not "its one label column is null".
        return ~select(StoryLabel.id).where(StoryLabel.story_id == Story.id).exists()
    column = _column_for(field)
    return column.is_(None)


def _in_predicate(
    field: str, values: tuple[str, ...], negated: bool, user_id: str | None
) -> ColumnElement[bool]:
    if field in _SELECT_ENUMS:
        enum_cls = _SELECT_ENUMS[field]
        column = getattr(Story, field)
        typed = [enum_cls(v) for v in values]
        return column.notin_(typed) if negated else column.in_(typed)

    if field == _LABEL_FIELD:
        predicate = _has_label(values)
        return ~predicate if negated else predicate

    if field in _ID_COLUMNS:
        column = _ID_COLUMNS[field]
        resolved = tuple(_resolve_id_value(field, v, user_id) for v in values)
        return column.notin_(resolved) if negated else column.in_(resolved)

    raise ValueError(f'Field "{field}" does not support "in" filters.')


def _between_predicate(field: str, start: str, end: str) -> ColumnElement[bool]:
    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)
    if field in _DATE_COLUMNS:
        column = _DATE_COLUMNS[field]
        return and_(column.is_not(None), column >= start_date, column <= end_date)
    if field in _DATETIME_COLUMNS:
        column = _DATETIME_COLUMNS[field]
        return and_(
            column >= _start_of_day(start_date),
            column <= _end_of_day(end_date),
        )
    raise ValueError(f'Field "{field}" does not support "between" filters.')


def _predicate(
    field: str, operator: str, value: str, user_id: str | None
) -> ColumnElement[bool]:
    if field in _SELECT_ENUMS:
        return _enum_predicate(field, operator, value)

    if field == _LABEL_FIELD:
        return _label_predicate(operator, value)

    if field in _ID_COLUMNS:
        return _id_predicate(field, operator, value, user_id)

    if field == "title":
        return _title_predicate(operator, value)

    if field in _DATE_COLUMNS:
        return _date_predicate(_DATE_COLUMNS[field], operator, value)

    if field in _DATETIME_COLUMNS:
        return _datetime_predicate(_DATETIME_COLUMNS[field], operator, value)

    raise ValueError(f'Unknown filter field "{field}".')


def _enum_predicate(field: str, operator: str, value: str) -> ColumnElement[bool]:
    enum_cls = _SELECT_ENUMS[field]
    column = getattr(Story, field)
    typed = enum_cls(value)
    if operator == "=":
        return column == typed
    if operator == "!=":
        return column != typed
    raise ValueError(f'Operator "{operator}" is not supported for field "{field}".')


def _label_predicate(operator: str, value: str) -> ColumnElement[bool]:
    predicate = _has_label((value,))
    if operator == "=":
        return predicate
    if operator == "!=":
        return ~predicate
    raise ValueError(f'Operator "{operator}" is not supported for field "label".')


def _id_predicate(
    field: str, operator: str, value: str, user_id: str | None
) -> ColumnElement[bool]:
    column = _ID_COLUMNS[field]
    resolved = _resolve_id_value(field, value, user_id)
    if operator == "=":
        return column == resolved
    if operator == "!=":
        return column != resolved
    raise ValueError(f'Operator "{operator}" is not supported for field "{field}".')


def _title_predicate(operator: str, value: str) -> ColumnElement[bool]:
    if operator == "~":
        return Story.title.ilike(f"%{value}%")
    if operator == "=":
        return Story.title == value
    if operator == "!=":
        return Story.title != value
    raise ValueError(f'Operator "{operator}" is not supported for field "title".')


def _date_predicate(column, operator: str, value: str) -> ColumnElement[bool]:
    parsed = date.fromisoformat(value)
    if operator == "=":
        return column == parsed
    if operator == "!=":
        return or_(column.is_(None), column != parsed)
    if operator == "<":
        return and_(column.is_not(None), column < parsed)
    if operator == "<=":
        return and_(column.is_not(None), column <= parsed)
    if operator == ">":
        return and_(column.is_not(None), column > parsed)
    if operator == ">=":
        return and_(column.is_not(None), column >= parsed)
    raise ValueError(f'Operator "{operator}" is not supported for date field.')


def _datetime_predicate(column, operator: str, value: str) -> ColumnElement[bool]:
    parsed = date.fromisoformat(value)
    if operator == "=":
        return func.date(column) == parsed
    if operator == "!=":
        return func.date(column) != parsed
    if operator == "<":
        return column < _start_of_day(parsed)
    if operator == "<=":
        return column <= _end_of_day(parsed)
    if operator == ">":
        return column > _end_of_day(parsed)
    if operator == ">=":
        return column >= _start_of_day(parsed)
    raise ValueError(f'Operator "{operator}" is not supported for datetime field.')


def _column_for(field: str):
    if field == _LABEL_FIELD:
        raise ValueError('Field "label" is a set — use =, !=, in, or is null.')
    if field in _SELECT_ENUMS:
        return getattr(Story, field)
    if field in _ID_COLUMNS:
        return _ID_COLUMNS[field]
    if field == "title":
        return Story.title
    if field in _DATE_COLUMNS:
        return _DATE_COLUMNS[field]
    if field in _DATETIME_COLUMNS:
        return _DATETIME_COLUMNS[field]
    raise ValueError(f'Unknown filter field "{field}".')


def _resolve_id_value(field: str, value: str, user_id: str | None) -> str | None:
    if field == "assignee" and value == "me":
        return user_id
    return value


def _start_of_day(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def _end_of_day(d: date) -> datetime:
    return datetime.combine(d, time.max, tzinfo=timezone.utc)
