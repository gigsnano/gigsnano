import enum

from sqlalchemy import (
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EViewLayout(str, enum.Enum):
    BOARD = "board"
    LIST = "list"
    TABLE = "table"


class EViewShareScope(str, enum.Enum):
    PRIVATE = "private"
    PROJECT = "project"


class EViewKind(str, enum.Enum):
    PROJECT = "project"
    WORKSPACE = "workspace"


VIEW_LAYOUT_ENUM = Enum(EViewLayout, name="view_layout", values_callable=_values)
VIEW_SHARE_SCOPE_ENUM = Enum(
    EViewShareScope, name="view_share_scope", values_callable=_values
)
VIEW_KIND_ENUM = Enum(EViewKind, name="view_kind", values_callable=_values)


class ProjectView(TimestampedBase):
    __tablename__ = "project_views"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    layout: Mapped[EViewLayout] = mapped_column(VIEW_LAYOUT_ENUM)
    filter_query: Mapped[str] = mapped_column(Text, default="")
    share_scope: Mapped[EViewShareScope] = mapped_column(
        VIEW_SHARE_SCOPE_ENUM, default=EViewShareScope.PRIVATE
    )


class WorkspaceView(TimestampedBase):
    __tablename__ = "workspace_views"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    layout: Mapped[EViewLayout] = mapped_column(VIEW_LAYOUT_ENUM)
    filter_query: Mapped[str] = mapped_column(Text, default="")
    share_scope: Mapped[EViewShareScope] = mapped_column(
        VIEW_SHARE_SCOPE_ENUM, default=EViewShareScope.PRIVATE
    )


class ViewFavorite(TimestampedBase):
    """Per-user favourite on a project or workspace saved view."""

    __tablename__ = "view_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "view_id", "view_kind", name="uq_view_favorite"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    view_id: Mapped[str] = mapped_column(String(36), index=True)
    view_kind: Mapped[EViewKind] = mapped_column(VIEW_KIND_ENUM)
