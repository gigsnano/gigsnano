import enum
from datetime import date, datetime, timedelta

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gigsnano_api.auth.models import User
from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values
from gigsnano_api.models.workspace import STATUS_ENUM, EMemberStatus


class EProjectFlow(str, enum.Enum):
    FRESH = "fresh"
    EXISTING = "existing"


class EProjectRole(str, enum.Enum):
    # Project-scoped roles, separate from workspace roles (GIN-318). OWNER is the
    # top project authority (transfer/delete); a project always keeps >=1 OWNER.
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class ECloneStatus(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    CLONING = "cloning"
    READY = "ready"
    FAILED = "failed"


class EIndexStatus(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    INDEXING = "indexing"
    READY = "ready"
    FAILED = "failed"


class EProjectActivityType(str, enum.Enum):
    CREATED = "created"
    UPDATED = "updated"
    DESCRIPTION = "description"
    MEMBER = "member"
    CYCLE = "cycle"
    STORY = "story"
    COMMENT = "comment"


class EPlanningMethod(str, enum.Enum):
    """How a project plans/estimates (GIN-330). Automatic is estimate-free — the
    forecast (GIN-334) runs off throughput, no points required."""

    AUTOMATIC = "automatic"  # no estimates
    SIMPLE = "simple"  # XS/S/M/L/XL sizes
    POINTS = "points"  # story points
    TIME = "time"  # time estimates


PROJECT_FLOW_ENUM = Enum(EProjectFlow, name="project_flow", values_callable=_values)
PROJECT_ROLE_ENUM = Enum(EProjectRole, name="project_role", values_callable=_values)
PLANNING_METHOD_ENUM = Enum(EPlanningMethod, name="planning_method", values_callable=_values)


ACTIVITY_TYPE_ENUM = Enum(EProjectActivityType, name="activity_type", values_callable=_values)
CLONE_STATUS_ENUM = Enum(ECloneStatus, name="clone_status", values_callable=_values)
INDEX_STATUS_ENUM = Enum(EIndexStatus, name="index_status", values_callable=_values)


def _default_start() -> date:
    return date.today()


def _default_target() -> date:
    return date.today() + timedelta(days=90)


class Project(TimestampedBase):
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("workspace_id", "identifier"),)

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    identifier: Mapped[str] = mapped_column(String(10))
    description: Mapped[str] = mapped_column(Text, default="")
    overview: Mapped[str] = mapped_column(Text, default="")  # rich-text HTML
    overview_json: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)  # GIN-300
    cover_image_url: Mapped[str] = mapped_column(String(500))
    logo_emoji: Mapped[str | None] = mapped_column(String(16), default=None)
    logo_color: Mapped[str | None] = mapped_column(String(32), default=None)
    # Uploaded logo image (capability URL from the images endpoint). When set it
    # takes precedence over logo_emoji in the UI (GIN-44).
    logo_image_url: Mapped[str | None] = mapped_column(String(500), default=None)
    start_date: Mapped[date] = mapped_column(Date, default=_default_start)
    target_date: Mapped[date] = mapped_column(Date, default=_default_target)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), default=None)
    flow: Mapped[EProjectFlow] = mapped_column(PROJECT_FLOW_ENUM, default=EProjectFlow.FRESH)
    has_ui: Mapped[bool] = mapped_column(Boolean, default=True)
    # Planning/estimation method (GIN-330). Default Automatic — no estimates required.
    # `_updated_at` records when it last changed (actor is captured in the audit log).
    planning_method: Mapped[EPlanningMethod] = mapped_column(
        PLANNING_METHOD_ENUM, default=EPlanningMethod.AUTOMATIC
    )
    planning_method_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    repo_full_name: Mapped[str | None] = mapped_column(String(200), default=None)
    repo_url: Mapped[str | None] = mapped_column(String(300), default=None)
    repo_default_branch: Mapped[str | None] = mapped_column(String(100), default=None)
    clone_status: Mapped[ECloneStatus] = mapped_column(CLONE_STATUS_ENUM, default=ECloneStatus.NONE)
    clone_error: Mapped[str | None] = mapped_column(Text, default=None)
    index_status: Mapped[EIndexStatus] = mapped_column(INDEX_STATUS_ENUM, default=EIndexStatus.NONE)
    index_error: Mapped[str | None] = mapped_column(Text, default=None)
    indexed_commit_sha: Mapped[str | None] = mapped_column(String(64), default=None)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # Solution foundation (GIN-443/445/446) — nullable until a project is created from a draft.
    solution_key: Mapped[str | None] = mapped_column(String(64), default=None, index=True)
    solution_version: Mapped[int | None] = mapped_column(Integer, default=None)


class ProjectMember(TimestampedBase):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[EProjectRole] = mapped_column(PROJECT_ROLE_ENUM, default=EProjectRole.MEMBER)
    status: Mapped[EMemberStatus] = mapped_column(STATUS_ENUM, default=EMemberStatus.ACTIVE)

    user: Mapped[User] = relationship()


class ProjectActivity(TimestampedBase):
    __tablename__ = "project_activities"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[EProjectActivityType] = mapped_column(ACTIVITY_TYPE_ENUM)
    actor_name: Mapped[str] = mapped_column(String(120))
    actor_avatar_url: Mapped[str | None] = mapped_column(String(500), default=None)
    action: Mapped[str] = mapped_column(String(300))


class EStateGroup(str, enum.Enum):
    BACKLOG = "backlog"
    UNSTARTED = "unstarted"
    STARTED = "started"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


STATE_GROUP_ENUM = Enum(EStateGroup, name="state_group", values_callable=_values)


class ProjectLabel(TimestampedBase):
    __tablename__ = "project_labels"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(20))


class ProjectState(TimestampedBase):
    __tablename__ = "project_states"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(20))
    group: Mapped[EStateGroup] = mapped_column(STATE_GROUP_ENUM)
    # "order" in the JSON contract; ORDER is an SQL keyword (Story precedent).
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ProjectFeature(TimestampedBase):
    __tablename__ = "project_features"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class ProjectEstimate(TimestampedBase):
    __tablename__ = "project_estimates"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    type: Mapped[str] = mapped_column(String(10))
    description: Mapped[str] = mapped_column(Text, default="")


class ECustomFieldType(str, enum.Enum):
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    SELECT = "select"


CUSTOM_FIELD_TYPE_ENUM = Enum(ECustomFieldType, name="custom_field_type", values_callable=_values)


class ProjectCustomField(TimestampedBase):
    __tablename__ = "project_custom_fields"
    __table_args__ = (UniqueConstraint("project_id", "name"),)

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    field_type: Mapped[ECustomFieldType] = mapped_column(CUSTOM_FIELD_TYPE_ENUM)
    options: Mapped[list | None] = mapped_column(JSON, default=None)
    sort_order: Mapped[float] = mapped_column(Float, default=0.0)


class ProjectAutomation(TimestampedBase):
    __tablename__ = "project_automations"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    trigger: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(200))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
