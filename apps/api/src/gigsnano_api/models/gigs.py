
from sqlalchemy import (
    JSON,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.artifacts import CHAT_ROLE_ENUM, EChatRole
from gigsnano_api.models.base import TimestampedBase


class GigsThread(TimestampedBase):
    """A workspace-level GigsAI chat thread (many per workspace — history).
    With kind="room" it is an Expert Room: a group chat of `participant_agent_ids`."""

    __tablename__ = "gigs_threads"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), default=None, index=True
    )
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    model: Mapped[str] = mapped_column(String(20), default="sonnet-5")
    pending_tool_calls: Mapped[dict | None] = mapped_column(JSON, default=None)
    kind: Mapped[str] = mapped_column(String(10), default="chat", server_default="chat")
    participant_agent_ids: Mapped[list] = mapped_column(JSON, default=list)
    rounds_since_human: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )


class GigsMessage(TimestampedBase):
    __tablename__ = "gigs_messages"

    thread_id: Mapped[str] = mapped_column(
        ForeignKey("gigs_threads.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[EChatRole] = mapped_column(CHAT_ROLE_ENUM)
    content: Mapped[str] = mapped_column(Text)
    speaker: Mapped[str | None] = mapped_column(String(50), default=None)
