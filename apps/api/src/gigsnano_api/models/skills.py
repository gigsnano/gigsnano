from sqlalchemy import JSON, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase

# JSONB on Postgres (queryable/indexable, the prod target); generic JSON under the
# SQLite test DB, which has no JSONB type. Same Python dict either way.
# ponytail: matches the established gigsnano_api.models.code_artifacts pattern.
_JSON = JSON().with_variant(JSONB(), "postgresql")


class SkillPackage(TimestampedBase):
    """Stable identity of a portable skill (GIN-284). Versions are immutable
    snapshots in `skill_versions`. `owner_workspace_id` NULL = public/built-in."""

    __tablename__ = "skill_packages"
    __table_args__ = (UniqueConstraint("owner_workspace_id", "name", name="uq_skill_pkg_owner_name"),)

    name: Mapped[str] = mapped_column(String(120), index=True)
    visibility: Mapped[str] = mapped_column(String(10), default="private")  # public | private
    owner_workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True
    )


class SkillVersion(TimestampedBase):
    """An immutable, content-addressed snapshot of a skill package. `data` is the
    server-built `.tgz`; `digest` is content-addressed over file hashes."""

    __tablename__ = "skill_versions"
    __table_args__ = (
        UniqueConstraint("package_id", "version", name="uq_skill_ver_pkg_version"),
    )

    package_id: Mapped[str] = mapped_column(
        ForeignKey("skill_packages.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[str] = mapped_column(String(20))
    digest: Mapped[str] = mapped_column(String(71))  # "sha256:" + 64 hex
    data: Mapped[bytes] = mapped_column(LargeBinary)
    byte_size: Mapped[int] = mapped_column(Integer)
    manifest: Mapped[dict] = mapped_column(_JSON, default=dict)
    lifecycle: Mapped[str] = mapped_column(String(12), default="draft")
