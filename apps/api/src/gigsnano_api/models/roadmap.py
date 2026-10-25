"""AI Roadmap & Releases (GIN-206): the planning hierarchy above epics/cycles.
Initiatives span projects (workspace-scoped, Sticky-shaped); Milestones are
project-scoped target-date rollups; Releases are versioned deliverables with a
changelog. Work items link via nullable milestone_id/release_id FKs on Story
(mirroring module_id) — no join table. Progress rolls up from linked stories.

ponytail: status columns are String (workflows convention), no native enums."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class Initiative(TimestampedBase):
    __tablename__ = "initiatives"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned|active|completed
    lead_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    target_date: Mapped[date | None] = mapped_column(Date, default=None)


class Milestone(TimestampedBase):
    __tablename__ = "milestones"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    initiative_id: Mapped[str | None] = mapped_column(
        ForeignKey("initiatives.id", ondelete="SET NULL"), default=None, index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="planned")
    target_date: Mapped[date | None] = mapped_column(Date, default=None)


class Release(TimestampedBase):
    __tablename__ = "releases"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(200), default="")
    changelog_md: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="unreleased")  # unreleased|released
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
