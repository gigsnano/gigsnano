import enum
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EExportStatus(str, enum.Enum):
    """Serialized values match the frontend EExportStatus."""

    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"


EXPORT_STATUS_ENUM = Enum(EExportStatus, name="export_status", values_callable=_values)


class ExportJob(TimestampedBase):
    """A workspace data export. Generated asynchronously (GIN-20) by a
    BackgroundTasks job: created PENDING, flipped to READY/FAILED once rendered.
    The serialized payload is stored inline on `content` and streamed by the
    download route, which 410s once `expires_at` has passed."""

    __tablename__ = "export_jobs"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    format: Mapped[str] = mapped_column(String(8))  # "csv" | "json" | "xlsx"
    status: Mapped[EExportStatus] = mapped_column(
        EXPORT_STATUS_ENUM, default=EExportStatus.PENDING
    )
    # xlsx is stored base64-encoded in this Text column (see features/exports/router.py).
    content: Mapped[str | None] = mapped_column(Text, default=None)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, default=None
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True, default=None
    )
    # Work-item export column keys (registry keys). Null for workspace exports.
    columns: Mapped[list | None] = mapped_column(JSON, default=None)
    # Story-filter snapshot for a "current view" export. Null = all items.
    filters: Mapped[dict | None] = mapped_column(JSON, default=None)
