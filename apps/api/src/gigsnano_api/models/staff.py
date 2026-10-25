
from sqlalchemy import (
    JSON,
    Boolean,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gigsnano_api.auth.models import User
from gigsnano_api.models.base import TimestampedBase


class StaffRole(TimestampedBase):
    """A named bundle of privilege keys (from admin.privileges). DB-editable.
    The `Superadmin` system role (is_system=True) holds all privileges and is
    protected from edit/delete."""

    __tablename__ = "staff_roles"

    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    privileges: Mapped[list] = mapped_column(JSON, default=list)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)


class StaffMember(TimestampedBase):
    """Marks a User as platform staff with a role. Presence of an active row is
    what gates /admin — NOT any workspace membership."""

    __tablename__ = "staff_members"
    __table_args__ = (UniqueConstraint("user_id"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("staff_roles.id", ondelete="RESTRICT"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User] = relationship()
    role: Mapped[StaffRole] = relationship()


class AuditLog(TimestampedBase):
    """Append-only staff action trail. Written via admin.audit.record_audit;
    never updated or deleted through the API."""

    __tablename__ = "audit_logs"

    actor_staff_id: Mapped[str | None] = mapped_column(
        ForeignKey("staff_members.id", ondelete="SET NULL"), default=None, index=True
    )
    # Denormalized at write time so hard-deleting the StaffMember (staff revocation)
    # doesn't blank out historical attribution on this row.
    actor_name: Mapped[str | None] = mapped_column(String(120), default=None)
    action: Mapped[str] = mapped_column(String(60), index=True)
    target_type: Mapped[str | None] = mapped_column(String(60), default=None)
    target_id: Mapped[str | None] = mapped_column(String(36), default=None)
    # "metadata" is reserved on Declarative classes → Python attr is `meta`.
    meta: Mapped[dict | None] = mapped_column("metadata", JSON, key="meta", default=None)
    ip_address: Mapped[str | None] = mapped_column(String(64), default=None)
    user_agent: Mapped[str | None] = mapped_column(String(400), default=None)
