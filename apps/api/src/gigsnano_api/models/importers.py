import enum

from sqlalchemy import (
    JSON,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EImportStatus(str, enum.Enum):
    """Serialized values match the frontend EImportStatus."""

    QUEUED = "queued"
    PARSING = "parsing"
    IMPORTING = "importing"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"


IMPORT_STATUS_ENUM = Enum(EImportStatus, name="import_status", values_callable=_values)


class ImportJob(TimestampedBase):
    """A Plane→GigsNano import job. Uploaded bytes are stored inline as base64
    (same storage choice as ExportJob's `content` — no object storage yet); the
    background task decodes+parses them and mutates `summary` as it goes."""

    __tablename__ = "import_jobs"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    source_format: Mapped[str] = mapped_column(String(8))  # "csv" | "json" | "xlsx"
    status: Mapped[EImportStatus] = mapped_column(
        IMPORT_STATUS_ENUM, default=EImportStatus.QUEUED
    )
    raw_content: Mapped[str] = mapped_column(Text)
    # Counts + diagnostics: projects_created, stories_created, stories_updated,
    # cycles_created, modules_created, labels_created, states_created,
    # skipped_drafts, unmatched_members: list[str], errors: list[{row, reason}].
    summary: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, default=None
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True, default=None
    )


class ImportedEntityRef(TimestampedBase):
    """Generic idempotency map: re-importing the same Plane export updates
    existing entities instead of duplicating them, keyed by this table."""

    __tablename__ = "imported_entity_refs"
    __table_args__ = (
        UniqueConstraint("workspace_id", "entity_type", "external_key"),
    )

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    # "project" | "story" | "cycle" | "module" | "label" | "state"
    entity_type: Mapped[str] = mapped_column(String(20))
    external_key: Mapped[str] = mapped_column(String(300))
    gigsnano_id: Mapped[str] = mapped_column(String(36))
