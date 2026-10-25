import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EWalletTxnType(str, enum.Enum):
    TOPUP = "topup"
    DEBIT = "debit"        # AI usage draw-down
    HOLD = "hold"          # escrow reserve (available → held)
    RELEASE = "release"    # escrow return (held → available)
    CAPTURE = "capture"    # escrow settle (held → freelancer)
    FEE = "fee"            # platform fee recorded as revenue
    PAYOUT = "payout"      # transfer to a connect account
    REFUND = "refund"


class EConnectStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    RESTRICTED = "restricted"


WALLET_TXN_TYPE_ENUM = Enum(EWalletTxnType, name="wallet_txn_type", values_callable=_values)
CONNECT_STATUS_ENUM = Enum(EConnectStatus, name="connect_status", values_callable=_values)


class Wallet(TimestampedBase):
    __tablename__ = "wallets"
    __table_args__ = (UniqueConstraint("workspace_id"),)

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    available_cents: Mapped[int] = mapped_column(Integer, default=0)
    held_cents: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="usd")


class WalletTransaction(TimestampedBase):
    __tablename__ = "wallet_transactions"
    __table_args__ = (Index("ix_wallet_txn_wallet_created", "wallet_id", "created_at"),)

    wallet_id: Mapped[str] = mapped_column(
        ForeignKey("wallets.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[EWalletTxnType] = mapped_column(WALLET_TXN_TYPE_ENUM)
    amount_cents: Mapped[int] = mapped_column(Integer)
    available_after: Mapped[int] = mapped_column(Integer)
    held_after: Mapped[int] = mapped_column(Integer)
    ref_type: Mapped[str | None] = mapped_column(String(40), default=None)
    ref_id: Mapped[str | None] = mapped_column(String(64), default=None)
    stripe_ref: Mapped[str | None] = mapped_column(String(120), default=None, index=True)


class ConnectAccount(TimestampedBase):
    __tablename__ = "connect_accounts"
    __table_args__ = (UniqueConstraint("user_id"),)

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    stripe_account_id: Mapped[str | None] = mapped_column(String(120), default=None)
    status: Mapped[EConnectStatus] = mapped_column(
        CONNECT_STATUS_ENUM, default=EConnectStatus.PENDING
    )
    payouts_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class PlatformConfig(TimestampedBase):
    """Singleton row (id='platform') holding runtime-overridable platform settings."""

    __tablename__ = "platform_config"

    platform_fee_bps: Mapped[int] = mapped_column(Integer, default=2000)


class EPlanTier(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    BUSINESS = "business"


class EBillingInterval(str, enum.Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


class ESubscriptionStatus(str, enum.Enum):
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"


PLAN_TIER_ENUM = Enum(EPlanTier, name="plan_tier", values_callable=_values)
BILLING_INTERVAL_ENUM = Enum(EBillingInterval, name="billing_interval", values_callable=_values)
SUBSCRIPTION_STATUS_ENUM = Enum(
    ESubscriptionStatus, name="subscription_status", values_callable=_values
)


class Subscription(TimestampedBase):
    """One subscription per workspace. Stripe is the source of truth once wired;
    a workspace with no row is treated as Free (see `get_or_create_subscription`)."""

    __tablename__ = "subscriptions"
    __table_args__ = (UniqueConstraint("workspace_id"),)

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    tier: Mapped[EPlanTier] = mapped_column(PLAN_TIER_ENUM, default=EPlanTier.FREE)
    interval: Mapped[EBillingInterval] = mapped_column(
        BILLING_INTERVAL_ENUM, default=EBillingInterval.MONTHLY
    )
    status: Mapped[ESubscriptionStatus] = mapped_column(
        SUBSCRIPTION_STATUS_ENUM, default=ESubscriptionStatus.ACTIVE
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(120), default=None, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(120), default=None, index=True
    )


class PlanPrice(TimestampedBase):
    """Admin-configured Stripe price for one purchasable (tier, interval) — GIN-30.
    The DB is the single source of truth (there is no `stripe_price_ids` env). Free
    has no row. Only `active` rows are used at checkout."""

    __tablename__ = "plan_prices"
    __table_args__ = (UniqueConstraint("tier", "interval"),)

    tier: Mapped[EPlanTier] = mapped_column(PLAN_TIER_ENUM)
    interval: Mapped[EBillingInterval] = mapped_column(BILLING_INTERVAL_ENUM)
    stripe_product_id: Mapped[str | None] = mapped_column(String(120), default=None)
    stripe_price_id: Mapped[str | None] = mapped_column(String(120), default=None)
    unit_amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="usd")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
