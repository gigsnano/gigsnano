import enum

from sqlalchemy import (
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class ECommitMode(str, enum.Enum):
    DIRECT = "direct"
    PR = "pr"  # follow-up: v1 always commits direct-to-branch


class ESyncJobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


COMMIT_MODE_ENUM = Enum(ECommitMode, name="commit_mode", values_callable=_values)
SYNC_STATUS_ENUM = Enum(ESyncJobStatus, name="sync_job_status", values_callable=_values)


class GitHubConnection(TimestampedBase):
    """One GitHub App installation + target repo per workspace (spec §3/§6)."""

    __tablename__ = "github_connections"
    __table_args__ = (UniqueConstraint("workspace_id"),)

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    # GitHub App path uses installation_id; OAuth App path uses access_token_encrypted.
    installation_id: Mapped[int | None] = mapped_column(Integer, default=None)
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    repo_full_name: Mapped[str | None] = mapped_column(String(200), default=None)
    repo_url: Mapped[str | None] = mapped_column(String(300), default=None)
    default_branch: Mapped[str] = mapped_column(String(100), default="main")
    commit_mode: Mapped[ECommitMode] = mapped_column(
        COMMIT_MODE_ENUM, default=ECommitMode.DIRECT
    )


class SyncJob(TimestampedBase):
    __tablename__ = "sync_jobs"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[ESyncJobStatus] = mapped_column(
        SYNC_STATUS_ENUM, default=ESyncJobStatus.QUEUED
    )
    commit_sha: Mapped[str | None] = mapped_column(String(40), default=None)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)


class DocSyncState(TimestampedBase):
    """Last-synced git blob SHA per materialized path — the idempotency ledger
    and the future two-way-sync hook (spec §1)."""

    __tablename__ = "doc_sync_state"
    __table_args__ = (UniqueConstraint("project_id", "path"),)

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(String(300))
    blob_sha: Mapped[str] = mapped_column(String(40))
    last_commit_sha: Mapped[str | None] = mapped_column(String(40), default=None)
