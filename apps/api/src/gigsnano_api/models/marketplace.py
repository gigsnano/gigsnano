import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EListingStatus(str, enum.Enum):
    OPEN = "open"
    AWARDED = "awarded"
    CLOSED = "closed"


class EBidStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    WITHDRAWN = "withdrawn"


class EContractStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


LISTING_STATUS_ENUM = Enum(EListingStatus, name="listing_status", values_callable=_values)
BID_STATUS_ENUM = Enum(EBidStatus, name="bid_status", values_callable=_values)
CONTRACT_STATUS_ENUM = Enum(EContractStatus, name="contract_status", values_callable=_values)


class MarketplaceListing(TimestampedBase):
    """A work item (story or cycle) published to the marketplace."""

    __tablename__ = "marketplace_listings"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    story_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), default=None, index=True
    )
    cycle_id: Mapped[str | None] = mapped_column(
        ForeignKey("cycles.id", ondelete="CASCADE"), default=None, index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[EListingStatus] = mapped_column(
        LISTING_STATUS_ENUM, default=EListingStatus.OPEN
    )
    posted_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )


class Bid(TimestampedBase):
    __tablename__ = "bids"

    listing_id: Mapped[str] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="CASCADE"), index=True
    )
    bidder_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    amount_cents: Mapped[int] = mapped_column(Integer)
    message: Mapped[str] = mapped_column(Text, default="")
    delivery_days: Mapped[int | None] = mapped_column(Integer, default=None)
    status: Mapped[EBidStatus] = mapped_column(BID_STATUS_ENUM, default=EBidStatus.PENDING)


class Contract(TimestampedBase):
    __tablename__ = "contracts"

    listing_id: Mapped[str] = mapped_column(
        ForeignKey("marketplace_listings.id", ondelete="CASCADE"), index=True
    )
    bid_id: Mapped[str] = mapped_column(
        ForeignKey("bids.id", ondelete="CASCADE"), unique=True
    )
    freelancer_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    bid_cents: Mapped[int] = mapped_column(Integer)
    fee_cents: Mapped[int] = mapped_column(Integer)
    hold_txn_id: Mapped[str] = mapped_column(String(36))
    status: Mapped[EContractStatus] = mapped_column(
        CONTRACT_STATUS_ENUM, default=EContractStatus.IN_PROGRESS
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )


class ContractAccess(TimestampedBase):
    """Grants a non-member scoped access to a work-item subtree while a contract is active."""

    __tablename__ = "contract_access"

    contract_id: Mapped[str] = mapped_column(
        ForeignKey("contracts.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    root_story_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), default=None, index=True
    )
    root_cycle_id: Mapped[str | None] = mapped_column(
        ForeignKey("cycles.id", ondelete="CASCADE"), default=None, index=True
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
