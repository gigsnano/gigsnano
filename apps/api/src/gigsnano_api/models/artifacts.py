import enum

from sqlalchemy import (
    JSON,
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gigsnano_api.models.base import TimestampedBase, _values


class EArtifactStatus(str, enum.Enum):
    DRAFT = "draft"
    FINAL = "final"


class ESessionState(str, enum.Enum):
    CONVERSING = "conversing"
    READY_TO_FINALIZE = "ready_to_finalize"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    FAILED = "failed"


class EChatRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


ARTIFACT_STATUS_ENUM = Enum(EArtifactStatus, name="artifact_status", values_callable=_values)
SESSION_STATE_ENUM = Enum(ESessionState, name="session_state", values_callable=_values)
CHAT_ROLE_ENUM = Enum(EChatRole, name="chat_role", values_callable=_values)


class Artifact(TimestampedBase):
    """A BMAD-generated (or user-authored) document. Versioned by append (spec §3)."""

    __tablename__ = "artifacts"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    doc_type: Mapped[str] = mapped_column(String(40), index=True)
    source_workflow: Mapped[str | None] = mapped_column(String(80), default=None)
    version: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(200))
    content_md: Mapped[str] = mapped_column(Text, default="")
    structured_json: Mapped[dict | None] = mapped_column(JSON, default=None)
    status: Mapped[EArtifactStatus] = mapped_column(
        ARTIFACT_STATUS_ENUM, default=EArtifactStatus.DRAFT
    )
    source_story_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None
    )
    file_name: Mapped[str | None] = mapped_column(String(300), default=None)
    mime_type: Mapped[str | None] = mapped_column(String(120), default=None)

    # --- external package provenance (GIN-394) ---
    package_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_packages.id", ondelete="CASCADE"), default=None, index=True
    )
    uploaded_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    source_attribution: Mapped[str | None] = mapped_column(String(200), default=None)
    canonical: Mapped[bool] = mapped_column(Boolean, default=False)
    #: ok | unsupported | too_large | encrypted | empty | duplicate
    parse_state: Mapped[str | None] = mapped_column(String(20), default=None)
    parse_error: Mapped[str | None] = mapped_column(String(300), default=None)
    byte_size: Mapped[int | None] = mapped_column(Integer, default=None)
    checksum: Mapped[str | None] = mapped_column(String(64), default=None)
    #: Folder structure as uploaded, so traceability can cite the real path.
    original_path: Mapped[str | None] = mapped_column(String(500), default=None)

    comments: Mapped[list["ArtifactComment"]] = relationship(
        back_populates="artifact", cascade="all, delete-orphan"
    )


class ArtifactComment(TimestampedBase):
    """Block-anchored review comment — frontend IDocumentComment."""

    __tablename__ = "artifact_comments"

    artifact_id: Mapped[str] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), index=True
    )
    block_index: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    author_name: Mapped[str] = mapped_column(String(120))
    assignee: Mapped[str | None] = mapped_column(String(120), default=None)
    assignee_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    artifact: Mapped[Artifact] = relationship(back_populates="comments")


class ChatThread(TimestampedBase):
    """One agent chat per story (fresh context per workflow — BMAD principle)."""

    __tablename__ = "chat_threads"
    __table_args__ = (UniqueConstraint("story_id"),)

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    story_id: Mapped[str] = mapped_column(ForeignKey("stories.id", ondelete="CASCADE"))


class ChatMessage(TimestampedBase):
    __tablename__ = "chat_messages"

    thread_id: Mapped[str] = mapped_column(
        ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[EChatRole] = mapped_column(CHAT_ROLE_ENUM)
    content: Mapped[str] = mapped_column(Text)
    input_tokens: Mapped[int | None] = mapped_column(Integer, default=None)
    output_tokens: Mapped[int | None] = mapped_column(Integer, default=None)


class WorkflowSession(TimestampedBase):
    """State machine row for one workflow run (spec §5.3)."""

    __tablename__ = "workflow_sessions"
    __table_args__ = (UniqueConstraint("thread_id"),)

    thread_id: Mapped[str] = mapped_column(ForeignKey("chat_threads.id", ondelete="CASCADE"))
    workflow_id: Mapped[str] = mapped_column(String(80))
    bmad_version: Mapped[str] = mapped_column(String(40))
    state: Mapped[ESessionState] = mapped_column(
        SESSION_STATE_ENUM, default=ESessionState.CONVERSING
    )
    context_artifact_ids: Mapped[list] = mapped_column(JSON, default=list)
