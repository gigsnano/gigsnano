from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.core.db import TimestampedBase


class ProjectFoundation(TimestampedBase):
    __tablename__ = "project_foundations"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), unique=True, index=True
    )
    preset_key: Mapped[str] = mapped_column(String(100), default="")
    allowed_libraries: Mapped[list] = mapped_column(JSON, default=list)
    enforce_design_tokens: Mapped[bool] = mapped_column(Boolean, default=True)
    quality_gates: Mapped[list] = mapped_column(JSON, default=list)
    # Granular composer (GIN-225): DB engine + its data architecture.
    database: Mapped[str] = mapped_column(String(50), default="")
    architecture: Mapped[str] = mapped_column(String(50), default="")
    # Artifact library (GIN-194): ids of skills/design-systems/personas loaded in.
    pinned_artifacts: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="locked")
    version: Mapped[int] = mapped_column(Integer, default=1)
    # Living Foundation (GIN-196): snapshots of prior locked versions, and a
    # pending proposed change awaiting review (propose -> approve -> re-lock).
    history: Mapped[list] = mapped_column(JSON, default=list)
    pending_change: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class FoundationArtifact(TimestampedBase):
    """A loadable skill / design-system / persona (GIN-194). Built-ins are static
    (see features/foundation/artifacts.py); this table holds user-created ones."""

    __tablename__ = "foundation_artifacts"

    artifact_type: Mapped[str] = mapped_column(String(20))  # skill | design_system | persona
    name: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    visibility: Mapped[str] = mapped_column(String(10), default="private")  # private | public
    owner_workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True
    )
    payload: Mapped[str] = mapped_column(Text, default="")
