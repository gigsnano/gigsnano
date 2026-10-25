"""Teamspaces (GIN-245): a workspace-scoped grouping of members + projects with a
pinned persona/skill roster. Membership + project links follow the house join
pattern (a thin TimestampedBase model per link, not JSON/secondary) so rollups can
gate with `Story.project_id.in_(subselect)`."""

from sqlalchemy import JSON, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class Teamspace(TimestampedBase):
    __tablename__ = "teamspaces"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    # Pinned persona/skill artifact ids (GIN-194) — the team's default roster.
    pinned_artifacts: Mapped[list] = mapped_column(JSON, default=list)


class TeamspaceMember(TimestampedBase):
    __tablename__ = "teamspace_members"
    __table_args__ = (UniqueConstraint("teamspace_id", "user_id"),)

    teamspace_id: Mapped[str] = mapped_column(
        ForeignKey("teamspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class TeamspaceProject(TimestampedBase):
    __tablename__ = "teamspace_projects"
    __table_args__ = (UniqueConstraint("teamspace_id", "project_id"),)

    teamspace_id: Mapped[str] = mapped_column(
        ForeignKey("teamspaces.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
