"""marketplace flow

Revision ID: a1b2c3d4e5f7
Revises: f9d794d8321d
Create Date: 2026-07-05 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "f9d794d8321d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "marketplace_listings",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("story_id", sa.String(length=36), nullable=True),
        sa.Column("cycle_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("open", "awarded", "closed", name="listing_status"),
            nullable=False,
        ),
        sa.Column("posted_by_id", sa.String(length=36), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["cycle_id"], ["cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["posted_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_marketplace_listings_cycle_id"),
        "marketplace_listings",
        ["cycle_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketplace_listings_posted_by_id"),
        "marketplace_listings",
        ["posted_by_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketplace_listings_story_id"),
        "marketplace_listings",
        ["story_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_marketplace_listings_workspace_id"),
        "marketplace_listings",
        ["workspace_id"],
        unique=False,
    )

    op.create_table(
        "bids",
        sa.Column("listing_id", sa.String(length=36), nullable=False),
        sa.Column("bidder_id", sa.String(length=36), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("delivery_days", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "accepted", "declined", "withdrawn", name="bid_status"),
            nullable=False,
        ),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["bidder_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["listing_id"], ["marketplace_listings.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bids_bidder_id"), "bids", ["bidder_id"], unique=False)
    op.create_index(op.f("ix_bids_listing_id"), "bids", ["listing_id"], unique=False)

    op.create_table(
        "contracts",
        sa.Column("listing_id", sa.String(length=36), nullable=False),
        sa.Column("bid_id", sa.String(length=36), nullable=False),
        sa.Column("freelancer_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("bid_cents", sa.Integer(), nullable=False),
        sa.Column("fee_cents", sa.Integer(), nullable=False),
        sa.Column("hold_txn_id", sa.String(length=36), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "in_progress",
                "delivered",
                "completed",
                "cancelled",
                name="contract_status",
            ),
            nullable=False,
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["bid_id"], ["bids.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["freelancer_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"], ["marketplace_listings.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bid_id"),
    )
    op.create_index(
        op.f("ix_contracts_freelancer_id"), "contracts", ["freelancer_id"], unique=False
    )
    op.create_index(
        op.f("ix_contracts_listing_id"), "contracts", ["listing_id"], unique=False
    )
    op.create_index(
        op.f("ix_contracts_workspace_id"), "contracts", ["workspace_id"], unique=False
    )

    op.create_table(
        "contract_access",
        sa.Column("contract_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("root_story_id", sa.String(length=36), nullable=True),
        sa.Column("root_cycle_id", sa.String(length=36), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["contract_id"], ["contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["root_cycle_id"], ["cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["root_story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_contract_access_contract_id"),
        "contract_access",
        ["contract_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_contract_access_root_cycle_id"),
        "contract_access",
        ["root_cycle_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_contract_access_root_story_id"),
        "contract_access",
        ["root_story_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_contract_access_user_id"), "contract_access", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_contract_access_user_id"), table_name="contract_access")
    op.drop_index(op.f("ix_contract_access_root_story_id"), table_name="contract_access")
    op.drop_index(op.f("ix_contract_access_root_cycle_id"), table_name="contract_access")
    op.drop_index(op.f("ix_contract_access_contract_id"), table_name="contract_access")
    op.drop_table("contract_access")
    op.drop_index(op.f("ix_contracts_workspace_id"), table_name="contracts")
    op.drop_index(op.f("ix_contracts_listing_id"), table_name="contracts")
    op.drop_index(op.f("ix_contracts_freelancer_id"), table_name="contracts")
    op.drop_table("contracts")
    op.drop_index(op.f("ix_bids_listing_id"), table_name="bids")
    op.drop_index(op.f("ix_bids_bidder_id"), table_name="bids")
    op.drop_table("bids")
    op.drop_index(op.f("ix_marketplace_listings_workspace_id"), table_name="marketplace_listings")
    op.drop_index(op.f("ix_marketplace_listings_story_id"), table_name="marketplace_listings")
    op.drop_index(op.f("ix_marketplace_listings_posted_by_id"), table_name="marketplace_listings")
    op.drop_index(op.f("ix_marketplace_listings_cycle_id"), table_name="marketplace_listings")
    op.drop_table("marketplace_listings")
    op.execute("DROP TYPE IF EXISTS contract_status")
    op.execute("DROP TYPE IF EXISTS bid_status")
    op.execute("DROP TYPE IF EXISTS listing_status")
