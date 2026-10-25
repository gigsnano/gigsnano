import enum

from sqlalchemy import (
    JSON,
    Boolean,
    Enum,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gigsnano_api.models.base import TimestampedBase, _values


class EDeliveryStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"


WEBHOOK_DELIVERY_STATUS_ENUM = Enum(
    EDeliveryStatus, name="webhook_delivery_status", values_callable=_values
)


class Webhook(TimestampedBase):
    __tablename__ = "webhooks"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(500))
    events: Mapped[list] = mapped_column(JSON, default=list)
    secret: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    deliveries: Mapped[list["WebhookDelivery"]] = relationship(
        back_populates="webhook", cascade="all, delete-orphan"
    )


class WebhookDelivery(TimestampedBase):
    __tablename__ = "webhook_deliveries"

    webhook_id: Mapped[str] = mapped_column(
        ForeignKey("webhooks.id", ondelete="CASCADE"), index=True
    )
    event: Mapped[str] = mapped_column(String(60))
    status: Mapped[EDeliveryStatus] = mapped_column(WEBHOOK_DELIVERY_STATUS_ENUM)
    response_code: Mapped[int] = mapped_column(Integer)

    webhook: Mapped["Webhook"] = relationship(back_populates="deliveries")
