import enum

from sqlalchemy import (
    JSON,
    Boolean,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class ENotificationKind(str, enum.Enum):
    MENTION = "mention"
    ASSIGNMENT = "assignment"
    SPRINT = "sprint"
    SYSTEM = "system"
    REVIEW = "review"  # GIN-293: review/approval-gate events (readiness gates)
    AGENT = "agent"  # GIN-293: AI-agent run lifecycle (completed/failed/needs-input)


NOTIFICATION_KIND_ENUM = Enum(
    ENotificationKind, name="notification_kind", values_callable=_values
)


class Notification(TimestampedBase):
    __tablename__ = "notifications"
    __table_args__ = (
        Index(
            "ix_notifications_ws_receiver_read_created",
            "workspace_id",
            "receiver_id",
            "read",
            "created_at",
        ),
        Index("ix_notifications_receiver_created", "receiver_id", "created_at"),
    )

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    receiver_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    triggered_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), default=None
    )
    kind: Mapped[ENotificationKind] = mapped_column(NOTIFICATION_KIND_ENUM)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    href: Mapped[str | None] = mapped_column(String(300), default=None)
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class NotificationTemplate(TimestampedBase):
    __tablename__ = "notification_templates"

    trigger_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    kind: Mapped[ENotificationKind] = mapped_column(NOTIFICATION_KIND_ENUM)
    label: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    title_template: Mapped[str] = mapped_column(String(200))
    body_template: Mapped[str] = mapped_column(Text, default="")
    default_title_template: Mapped[str] = mapped_column(String(200))
    default_body_template: Mapped[str] = mapped_column(Text, default="")
    variables: Mapped[list] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    email_subject_template: Mapped[str] = mapped_column(Text, default="")
    email_body_html_template: Mapped[str] = mapped_column(Text, default="")
