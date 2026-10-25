import enum
from datetime import date

from sqlalchemy import (
    Boolean,
    Date,
    Enum,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class ECycleStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


CYCLE_STATUS_ENUM = Enum(ECycleStatus, name="cycle_status", values_callable=_values)


class Cycle(TimestampedBase):
    __tablename__ = "cycles"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[ECycleStatus] = mapped_column(CYCLE_STATUS_ENUM, default=ECycleStatus.DRAFT)
    is_sprint_zero: Mapped[bool] = mapped_column(Boolean, default=False)
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    end_date: Mapped[date | None] = mapped_column(Date, default=None)
