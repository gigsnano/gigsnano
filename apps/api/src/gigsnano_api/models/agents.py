import enum

from sqlalchemy import (
    JSON,
    Boolean,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values


class EAgentProvider(str, enum.Enum):
    CURSOR = "cursor"
    CODEX = "codex"
    CLAUDE_CODE = "claude_code"


class EAgentConnectionStatus(str, enum.Enum):
    CONNECTED = "connected"
    EXPIRED = "expired"
    REVOKED = "revoked"


class EDelegationStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_REVIEW = "awaiting_review"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EDelegationUnit(str, enum.Enum):
    WORK_ITEM = "work_item"
    BMAD_CARD = "bmad_card"


AGENT_PROVIDER_ENUM = Enum(EAgentProvider, name="agent_provider", values_callable=_values)
AGENT_CONN_STATUS_ENUM = Enum(
    EAgentConnectionStatus, name="agent_connection_status", values_callable=_values
)
DELEGATION_STATUS_ENUM = Enum(
    EDelegationStatus, name="delegation_status", values_callable=_values
)
DELEGATION_UNIT_ENUM = Enum(EDelegationUnit, name="delegation_unit", values_callable=_values)


class AgentConnection(TimestampedBase):
    """A per-user link to an external coding-agent account (Cursor/Codex/Claude Code)."""

    __tablename__ = "agent_connections"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_agent_connection_user_provider"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[EAgentProvider] = mapped_column(AGENT_PROVIDER_ENUM)
    account_label: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[EAgentConnectionStatus] = mapped_column(
        AGENT_CONN_STATUS_ENUM, default=EAgentConnectionStatus.CONNECTED
    )
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, default=None)


class Delegation(TimestampedBase):
    """One dispatch of a story (work item or BMAD card) to a connected agent."""

    __tablename__ = "delegations"

    unit_type: Mapped[EDelegationUnit] = mapped_column(DELEGATION_UNIT_ENUM)
    unit_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[EAgentProvider] = mapped_column(AGENT_PROVIDER_ENUM)
    connection_id: Mapped[str | None] = mapped_column(
        ForeignKey("agent_connections.id", ondelete="SET NULL"), default=None
    )
    delegated_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[EDelegationStatus] = mapped_column(
        DELEGATION_STATUS_ENUM, default=EDelegationStatus.QUEUED
    )
    custom_prompt: Mapped[str | None] = mapped_column(Text, default=None)
    result: Mapped[dict | None] = mapped_column(JSON, default=None)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    external_ref: Mapped[str | None] = mapped_column(String(200), default=None)


class Agent(TimestampedBase):
    """A callable specialist in a workspace's roster (contact list).

    `bundles` names capability bundles, never raw tool names: a roster row must
    not be able to grant a tool, only to select from reviewed groups of them.
    """

    __tablename__ = "agents"
    __table_args__ = (UniqueConstraint("workspace_id", "name", name="uq_agent_ws_name"),)

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    #: NULL = available across the workspace; set = pinned to one project.
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    persona: Mapped[str] = mapped_column(String(80), default="")
    #: Display grouping only. The orchestrator never branches on it — that is
    #: what keeps adding a non-software specialist a data change.
    domain: Mapped[str] = mapped_column(String(40), default="software")
    avatar_color: Mapped[str] = mapped_column(String(7), default="#6b7280")
    #: Azure neural voice name. "" defers to the locale default (`resolve_voice`).
    voice_id: Mapped[str] = mapped_column(String(64), default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    bundles: Mapped[list] = mapped_column(JSON_DOC, default=list)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
