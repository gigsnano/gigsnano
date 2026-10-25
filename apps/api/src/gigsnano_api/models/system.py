"""Multi-repository System Bundles (GIN-408 / GIN-409).

First-class one-to-many repository connections per project, plus manually
grouped System Bundles. Introduced alongside — not replacing — the legacy
singular `Project.repo_*` columns, which stay until telemetry proves no caller
reads them (GIN-409 keeps them).

Status/type/access are String-backed enums (`native_enum=False`) so no new
Postgres enum types are minted — the migration only adds plain columns, which
sidesteps the "enum created twice" upgrade abort this repo has hit before.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values

# Reuse the existing clone/index status vocabularies (already defined for Project).
from gigsnano_api.models.projects import ECloneStatus, EIndexStatus


class ERepositoryType(str, enum.Enum):
    APPLICATION = "application"
    SERVICE = "service"
    LIBRARY = "library"
    INFRASTRUCTURE = "infrastructure"
    CONFIGURATION = "configuration"
    DOCUMENTATION = "documentation"
    OTHER = "other"


class ERepoAccess(str, enum.Enum):
    WRITE = "write"
    REFERENCE = "reference"


class ESyncStatus(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    SYNCING = "syncing"
    READY = "ready"
    FAILED = "failed"


class EBundleStatus(str, enum.Enum):
    DRAFT = "draft"
    VALID = "valid"
    INVALID = "invalid"
    ARCHIVED = "archived"


def _str_enum(e: type[enum.Enum], length: int = 20) -> Enum:
    """A VARCHAR-backed enum (no native Postgres type, no CHECK constraint)."""
    return Enum(e, native_enum=False, length=length, values_callable=_values)


class ProjectRepository(TimestampedBase):
    __tablename__ = "project_repositories"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "provider", "external_repository_id", name="uq_project_repo_identity"
        ),
        # At most one active Primary per project. Partial unique index so archived
        # rows and non-primaries don't collide (dialect-specific WHERE clauses).
        Index(
            "uq_project_repo_one_active_primary",
            "project_id",
            unique=True,
            postgresql_where=text("is_primary AND archived_at IS NULL"),
            sqlite_where=text("is_primary = 1 AND archived_at IS NULL"),
        ),
    )

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    # The GitHub (etc.) connection this repo was reached through; nullable so a
    # migrated legacy repo needs no connection row to exist.
    provider_connection_id: Mapped[str | None] = mapped_column(String(36), default=None)
    provider: Mapped[str] = mapped_column(String(40), default="github")
    external_repository_id: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(300))
    display_name: Mapped[str] = mapped_column(String(200))
    repository_type: Mapped[ERepositoryType] = mapped_column(
        _str_enum(ERepositoryType), default=ERepositoryType.SERVICE
    )
    default_branch: Mapped[str] = mapped_column(String(200), default="main")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    default_access: Mapped[ERepoAccess] = mapped_column(
        _str_enum(ERepoAccess), default=ERepoAccess.REFERENCE
    )
    clone_status: Mapped[ECloneStatus] = mapped_column(
        _str_enum(ECloneStatus), default=ECloneStatus.NONE
    )
    clone_error: Mapped[str | None] = mapped_column(Text, default=None)
    sync_status: Mapped[ESyncStatus] = mapped_column(
        _str_enum(ESyncStatus), default=ESyncStatus.NONE
    )
    sync_error: Mapped[str | None] = mapped_column(Text, default=None)
    index_status: Mapped[EIndexStatus] = mapped_column(
        _str_enum(EIndexStatus), default=EIndexStatus.NONE
    )
    index_error: Mapped[str | None] = mapped_column(Text, default=None)
    indexed_commit_sha: Mapped[str | None] = mapped_column(String(64), default=None)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_by: Mapped[str | None] = mapped_column(String(36), default=None)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class SystemBundle(TimestampedBase):
    __tablename__ = "system_bundles"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[EBundleStatus] = mapped_column(
        _str_enum(EBundleStatus), default=EBundleStatus.DRAFT
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[str | None] = mapped_column(String(36), default=None)


class SystemBundleVersion(TimestampedBase):
    """An immutable snapshot of a bundle's configuration. Active runs pin a version.

    `configuration_json` holds the repositories + dependencies inline (same shape
    the frontend embeds as `latest`); `validation_result_json` holds the computed
    {valid, issues}. Normalising these into their own tables is deferred to the
    bundle-API story (GIN-412) — JSON matches the wire contract and needs no join.
    """

    __tablename__ = "system_bundle_versions"
    __table_args__ = (UniqueConstraint("bundle_id", "version", name="uq_bundle_version"),)

    bundle_id: Mapped[str] = mapped_column(
        ForeignKey("system_bundles.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    configuration_json: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
    validation_result_json: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
    created_by: Mapped[str | None] = mapped_column(String(36), default=None)


class ECodeScopeStatus(str, enum.Enum):
    DRAFT = "draft"
    CONFIRMED = "confirmed"


class ERepoScopeMode(str, enum.Enum):
    WRITE = "write"
    REFERENCE = "reference"
    EXCLUDED = "excluded"


class WorkItemCodeScope(TimestampedBase):
    """A technical work item's chosen bundle + per-repo Write/Reference/Excluded plan
    (GIN-413). Pins `bundle_version_id` so a later bundle edit can't silently change
    an in-flight run. One scope per work item."""

    __tablename__ = "work_item_code_scopes"
    __table_args__ = (UniqueConstraint("work_item_id", name="uq_code_scope_work_item"),)

    work_item_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    # The bundle version this scope is pinned to (nullable: a project with no bundle).
    bundle_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("system_bundle_versions.id", ondelete="SET NULL"), default=None
    )
    status: Mapped[ECodeScopeStatus] = mapped_column(
        _str_enum(ECodeScopeStatus), default=ECodeScopeStatus.DRAFT
    )
    branch_pattern: Mapped[str] = mapped_column(String(200), default="feature/{code}-{slug}")
    reason: Mapped[str] = mapped_column(Text, default="")
    confirmed_by: Mapped[str | None] = mapped_column(String(36), default=None)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class WorkItemRepositoryScope(TimestampedBase):
    """One repository's mode inside a work-item Code scope."""

    __tablename__ = "work_item_repository_scopes"
    __table_args__ = (
        UniqueConstraint("code_scope_id", "project_repository_id", name="uq_repo_scope_identity"),
    )

    code_scope_id: Mapped[str] = mapped_column(
        ForeignKey("work_item_code_scopes.id", ondelete="CASCADE"), index=True
    )
    project_repository_id: Mapped[str] = mapped_column(String(36))
    mode: Mapped[ERepoScopeMode] = mapped_column(
        _str_enum(ERepoScopeMode), default=ERepoScopeMode.REFERENCE
    )
    required_delivery: Mapped[bool] = mapped_column(Boolean, default=False)
    base_branch: Mapped[str] = mapped_column(String(200), default="main")
    reason: Mapped[str] = mapped_column(Text, default="")


class ECiState(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"


class EReviewState(str, enum.Enum):
    NONE = "none"
    PENDING = "pending"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"


class EMergeState(str, enum.Enum):
    PENDING = "pending"
    READY = "ready"
    MERGED = "merged"
    BLOCKED = "blocked"


class DeliveryBundle(TimestampedBase):
    """Coordinated delivery of one work item across several repositories (GIN-414).
    Overall state is computed from the per-repo rows — never stored as truth."""

    __tablename__ = "delivery_bundles"
    __table_args__ = (UniqueConstraint("work_item_id", name="uq_delivery_work_item"),)

    work_item_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    code_scope_id: Mapped[str | None] = mapped_column(String(36), default=None)
    bundle_version_id: Mapped[str | None] = mapped_column(String(36), default=None)
    branch_name: Mapped[str] = mapped_column(String(300), default="")
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    rollback_required: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(String(36), default=None)


class DeliveryRepository(TimestampedBase):
    """One repository's delivery record inside a Delivery Bundle."""

    __tablename__ = "delivery_repositories"
    __table_args__ = (
        UniqueConstraint(
            "delivery_bundle_id", "project_repository_id", name="uq_delivery_repo_identity"
        ),
    )

    delivery_bundle_id: Mapped[str] = mapped_column(
        ForeignKey("delivery_bundles.id", ondelete="CASCADE"), index=True
    )
    project_repository_id: Mapped[str] = mapped_column(String(36))
    base_branch: Mapped[str] = mapped_column(String(200), default="main")
    head_branch: Mapped[str] = mapped_column(String(300), default="")
    commit_count: Mapped[int] = mapped_column(Integer, default=0)
    pr_url: Mapped[str] = mapped_column(String(500), default="")
    pr_id: Mapped[str] = mapped_column(String(64), default="")
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    ci_state: Mapped[ECiState] = mapped_column(_str_enum(ECiState), default=ECiState.NONE)
    review_state: Mapped[EReviewState] = mapped_column(
        _str_enum(EReviewState), default=EReviewState.NONE
    )
    merge_order: Mapped[int] = mapped_column(Integer, default=0)
    merge_state: Mapped[EMergeState] = mapped_column(
        _str_enum(EMergeState), default=EMergeState.PENDING
    )
    no_change: Mapped[bool] = mapped_column(Boolean, default=False)
    change_summary: Mapped[str] = mapped_column(Text, default="")
    deployment_impact: Mapped[str] = mapped_column(String(200), default="")


class EHealthRollup(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    BLOCKED = "blocked"
    UNKNOWN = "unknown"


class SystemAuditEvent(TimestampedBase):
    """Audit trail for multi-repo actions (GIN-416): who did what to which object,
    with a before/after summary and correlation id. Summaries only — never repo
    URLs, file content, commands, credentials, or secret values."""

    __tablename__ = "system_audit_events"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    actor_user_id: Mapped[str | None] = mapped_column(String(36), default=None)
    action: Mapped[str] = mapped_column(String(80))
    object_type: Mapped[str] = mapped_column(String(40))
    object_id: Mapped[str | None] = mapped_column(String(36), default=None)
    before_summary: Mapped[str] = mapped_column(Text, default="")
    after_summary: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    correlation_id: Mapped[str | None] = mapped_column(String(64), default=None)


class SourceSnapshot(TimestampedBase):
    """Immutable record of the exact repository commits an execution/deploy ran
    against (GIN-415). Captured from the confirmed Code scope so a run can always
    be reproduced and audited; never mutated after creation."""

    __tablename__ = "source_snapshots"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    work_item_id: Mapped[str | None] = mapped_column(String(36), default=None, index=True)
    bundle_version_id: Mapped[str | None] = mapped_column(String(36), default=None)
    agent_run_id: Mapped[str | None] = mapped_column(String(36), default=None)
    deployment_run_id: Mapped[str | None] = mapped_column(String(36), default=None)
    # {project_repository_id: {commit_sha, mount_path, mode, base_branch}} — no secrets.
    repository_commits_json: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
