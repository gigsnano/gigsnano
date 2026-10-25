from sqlalchemy import JSON, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class SlackConnection(TimestampedBase):
    """One Slack workspace install per GigsNano workspace (GIN-23a). Mirrors
    `GitHubConnection`'s OAuth-App shape: bot token stored Fernet-encrypted,
    `default_channel_id` set after connect via the channel picker."""

    __tablename__ = "slack_connections"
    __table_args__ = (UniqueConstraint("workspace_id"),)

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    access_token_encrypted: Mapped[str] = mapped_column(Text)
    team_id: Mapped[str] = mapped_column(String(40))
    team_name: Mapped[str] = mapped_column(String(200))
    bot_user_id: Mapped[str] = mapped_column(String(40))
    default_channel_id: Mapped[str | None] = mapped_column(String(40), default=None)
    default_channel_name: Mapped[str | None] = mapped_column(String(200), default=None)
    # Subset of webhooks.events.WEBHOOK_EVENTS — same 4-event catalog, not a second one.
    notify_events: Mapped[list[str]] = mapped_column(JSON, default=list)
    connected_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
