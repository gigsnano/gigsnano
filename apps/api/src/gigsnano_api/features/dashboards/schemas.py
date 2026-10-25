import enum
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class EChartBucket(str, enum.Enum):
    """How a window is grouped. Wide windows default to weeks client-side so a
    90-day chart isn't 90 columns wide; the caller always states which it wants."""

    DAY = "day"
    WEEK = "week"


class DashboardOut(BaseModel):
    id: str
    workspace_slug: str
    owner_id: str
    name: str
    description: str
    is_favorite: bool
    layout: dict[str, Any]
    config: dict[str, Any]
    # Public sharing (GIN-489). `public_token` is returned only on this
    # owner-scoped endpoint, so the owner can re-copy the link at any time.
    visibility: str = "private"
    public_token: str | None = None
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ShareDashboardPayload(BaseModel):
    """Set a dashboard's visibility.

    - "private": only the owner. Revokes any public link immediately.
    - "shared": every member of the workspace can open it, signed in. No link.
    - "public": anyone holding the token link, signed in or not.

    "shared" and "public" are separate levels rather than one flag because they
    answer different questions — one widens the audience inside the tenant, the
    other leaves it.
    """

    visibility: Literal["private", "shared", "public"]


class PublicWidgetOut(BaseModel):
    """One widget as an anonymous visitor sees it: enough to lay it out and label
    it, with every identity-bearing setting (project/assignee filters) stripped —
    those stay server-side and are applied when the widget asks for its data."""

    id: str
    type: str
    title: str
    x: int
    y: int
    w: int
    h: int
    settings: dict[str, Any]


class PublicDashboardFiltersOut(BaseModel):
    """A published board's date window. Its project filter stays server-side."""

    date_range: str | None = None
    date_from: str | None = None
    date_to: str | None = None


class PublicDashboardOut(BaseModel):
    """A published dashboard for anonymous viewers. Carries no workspace, owner,
    project or user identifiers — only what the page renders."""

    name: str
    description: str
    widgets: list[PublicWidgetOut]
    updated_at: datetime
    filters: PublicDashboardFiltersOut = PublicDashboardFiltersOut()


class CreateDashboardPayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    layout: dict[str, Any] | None = None
    config: dict[str, Any] | None = None


class UpdateDashboardPayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_favorite: bool | None = None
    layout: dict[str, Any] | None = None
    config: dict[str, Any] | None = None


class LabelCountOut(BaseModel):
    """One label and how many work items carry it (Jira "Labels" gadget parity).

    Name and colour are denormalized here because labels are per-project: a
    workspace-wide widget would otherwise have to fetch every project's label set
    just to resolve ids.
    """

    id: str
    name: str
    color: str
    count: int


class DashboardMetricsOut(BaseModel):
    """Pre-aggregated work-item metrics for dashboard widgets (GIN-54)."""

    total: int
    open: int  # not done
    status_counts: dict[str, int]
    priority_counts: dict[str, int]
    assignee_counts: dict[str, int]  # assignee_id (or "unassigned") -> count
    # GIN-164 — assignee_id (or "unassigned") -> {status -> count}. The cross-tab
    # assignee_counts can't express: it powers the per-person status columns.
    assignee_status_counts: dict[str, dict[str, int]]
    label_counts: list[LabelCountOut]


class DailyActivityPoint(BaseModel):
    """One period of work-item activity -- things that happened (GIN-163, GIN-527)."""

    date: date
    created: int
    updated: int
    completed: int


class DashboardActivityOut(BaseModel):
    """Work-item activity over a date window (GIN-161/163, GIN-527).

    Counts *events*: items created, items changed, and items closed, each on the
    day it happened. `date` is the period's first day, so a weekly bucket is
    identified by its Monday (or by `period_from` for the clamped first week).
    """

    period_from: date
    period_to: date
    bucket: EChartBucket
    daily: list[DailyActivityPoint]


class PlannedWorkloadPoint(BaseModel):
    """One period of *scheduled* work -- things meant to happen (GIN-527)."""

    date: date
    starting: int
    due: int
    overdue: int


class PlannedWorkloadOut(BaseModel):
    """Scheduled work over a date window (GIN-527).

    Deliberately separate from activity: a planned date is not an event, and
    charting the two together lets newly-filed work read as delivered work.
    """

    period_from: date
    period_to: date
    bucket: EChartBucket
    daily: list[PlannedWorkloadPoint]
