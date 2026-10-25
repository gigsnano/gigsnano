from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Callable

from gigsnano_api.models import (
    ECustomFieldType,
    EStoryPriority,
    EStoryStatus,
    EStoryType,
    ProjectCustomField,
    Story,
)

SHEET_NAME = "Work Items"


@dataclass
class RenderCtx:
    identifier: str
    email_of: dict[str, str]          # user_id -> email
    code_of: dict[str, str]           # story_id -> "IDENT-<n>"
    label_name_of: dict[str, str]     # label_id -> name
    # story_id -> its label ids (GIN-475). Defaults empty: a caller that only
    # renders non-label columns has no reason to load them.
    label_ids_of: dict[str, list[str]] = field(default_factory=dict)
    custom_of: dict[str, dict[str, str]] = field(default_factory=dict)  # story_id -> {custom_field_id: value}


@dataclass(frozen=True)
class Column:
    key: str
    header: str
    export: Callable[[Story, RenderCtx], str]
    field: str | None = None                       # direct Story attr set on import
    coerce: Callable[[str], object] | None = None  # raw cell -> typed value
    custom_field_id: str | None = None             # set for project-custom columns (cf:{id})


def _enum_from(raw: str, enum_cls, label: str):
    v = (raw or "").strip().lower().replace(" ", "_")
    for m in enum_cls:
        if m.value == v:
            return m
    raise ValueError(f"invalid {label}: {raw!r}")


def coerce_status(raw: str) -> EStoryStatus:
    return _enum_from(raw, EStoryStatus, "status")


def coerce_priority(raw: str) -> EStoryPriority:
    return _enum_from(raw, EStoryPriority, "priority")


def coerce_type(raw: str) -> EStoryType:
    return _enum_from(raw, EStoryType, "type")


def coerce_date(raw: str) -> date:
    return date.fromisoformat((raw or "").strip())  # raises ValueError on bad input


def coerce_estimate(raw: str) -> int:
    s = (raw or "").strip()
    if not s.lstrip("-").isdigit():
        raise ValueError(f"estimate must be a whole number: {raw!r}")
    return int(s)


def _code(story: Story, ctx: RenderCtx) -> str:
    return ctx.code_of.get(story.id, "")


def _parent(story: Story, ctx: RenderCtx) -> str:
    return ctx.code_of.get(story.parent_id, "") if story.parent_id else ""


def _assignee(story: Story, ctx: RenderCtx) -> str:
    return ctx.email_of.get(story.assignee_id, "") if story.assignee_id else ""


def _labels(story: Story, ctx: RenderCtx) -> str:
    """All of the item's labels, comma-joined — a work item has many (GIN-475)."""
    names = [ctx.label_name_of.get(lid, "") for lid in ctx.label_ids_of.get(story.id, [])]
    return ", ".join(n for n in names if n)


COLUMNS: list[Column] = [
    Column("code", "Code", _code),
    Column("title", "Title", lambda s, c: s.title, field="title", coerce=lambda r: (r or "").strip()),
    Column("type", "Type", lambda s, c: s.type.value, field="type", coerce=coerce_type),
    Column("parent", "Parent", _parent),
    Column("status", "Status", lambda s, c: s.status.value, field="status", coerce=coerce_status),
    Column("priority", "Priority", lambda s, c: s.priority.value, field="priority", coerce=coerce_priority),
    Column("assignee", "Assignee", _assignee),
    Column("labels", "Labels", _labels),
    Column("start_date", "Start date", lambda s, c: s.start_date.isoformat() if s.start_date else "",
           field="start_date", coerce=coerce_date),
    Column("target_date", "Target date", lambda s, c: s.target_date.isoformat() if s.target_date else "",
           field="target_date", coerce=coerce_date),
    Column("estimate", "Estimate", lambda s, c: "" if s.estimate_points is None else str(s.estimate_points),
           field="estimate_points", coerce=coerce_estimate),
    Column("description", "Description", lambda s, c: _strip_html(s.description or "")),
]

DEFAULT_KEYS: list[str] = [c.key for c in COLUMNS]
HEADER_TO_KEY: dict[str, str] = {c.header.lower(): c.key for c in COLUMNS}
COLUMN_BY_KEY: dict[str, Column] = {c.key: c for c in COLUMNS}


def _strip_html(html: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", html).strip()


def _custom_export(field_id: str) -> Callable[[Story, RenderCtx], str]:
    def _e(story: Story, ctx: RenderCtx) -> str:
        return ctx.custom_of.get(story.id, {}).get(field_id, "")
    return _e


def _custom_coerce(cf: ProjectCustomField) -> Callable[[str], str]:
    def _c(raw: str) -> str:
        s = (raw or "").strip()
        if s == "":
            return ""
        if cf.field_type == ECustomFieldType.NUMBER:
            n = float(s)  # raises ValueError
            return str(int(n)) if n.is_integer() else str(n)
        if cf.field_type == ECustomFieldType.DATE:
            return date.fromisoformat(s).isoformat()  # raises ValueError
        if cf.field_type == ECustomFieldType.SELECT:
            if s not in (cf.options or []):
                raise ValueError(f"not a valid option: {s!r}")
            return s
        return s
    return _c


def build_columns(custom_fields: list[ProjectCustomField]) -> list[Column]:
    """Static registry + one `cf:{id}` Column per project custom field."""
    cols = list(COLUMNS)
    for cf in custom_fields:
        cols.append(Column(
            key=f"cf:{cf.id}",
            header=cf.name,
            export=_custom_export(cf.id),
            custom_field_id=cf.id,
            coerce=_custom_coerce(cf),
        ))
    return cols


def header_map(columns: list[Column]) -> dict[str, str]:
    return {c.header.lower(): c.key for c in columns}


def columns_by_key(columns: list[Column]) -> dict[str, Column]:
    return {c.key: c for c in columns}
