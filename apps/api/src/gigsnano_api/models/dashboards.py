from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class Dashboard(TimestampedBase):
    """A personal, customizable dashboard (Jira-style) owned by one user.

    `layout` holds display config (e.g. column count); `config` holds the ordered
    widget list. Both are opaque JSON here — the widget framework (GIN-47+) owns
    their shape. MVP is personal/private, so `is_favorite` is a per-row bool.
    """

    __tablename__ = "dashboards"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    layout: Mapped[dict] = mapped_column(JSON, default=lambda: {"columns": 2})
    config: Mapped[dict] = mapped_column(JSON, default=lambda: {"widgets": []})

    # Public sharing (GIN-489). "private" | "public"; always private until the
    # owner explicitly publishes. The token is the whole access credential, so a
    # row is only reachable anonymously while visibility == "public".
    visibility: Mapped[str] = mapped_column(String(16), default="private", server_default="private")
    # Stored in the clear, deliberately: the owner must be able to re-copy the
    # link from the share dialog on any device, which a one-way hash makes
    # impossible. It is a random 32-byte capability, unique-indexed for lookup,
    # and never leaves the row except to the owner or a holder of the link.
    public_token: Mapped[str | None] = mapped_column(
        String(64), default=None, unique=True, index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    published_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    public_token_rotated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
