import enum
from datetime import date

from sqlalchemy import (
    Date,
    Enum,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EModuleStatus(str, enum.Enum):
    BACKLOG = "backlog"
    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


MODULE_STATUS_ENUM = Enum(EModuleStatus, name="module_status", values_callable=_values)


class Module(TimestampedBase):
    __tablename__ = "modules"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[EModuleStatus] = mapped_column(MODULE_STATUS_ENUM, default=EModuleStatus.BACKLOG)
    lead_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), default=None)
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    target_date: Mapped[date | None] = mapped_column(Date, default=None)
    color: Mapped[str | None] = mapped_column(String(9), default=None)  # hex, e.g. "#6b7280"
