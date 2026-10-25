from datetime import datetime

from pydantic import BaseModel, Field

from gigsnano_api.models import EBidStatus, EContractStatus, EListingStatus


class PublishListingIn(BaseModel):
    story_id: str | None = None
    cycle_id: str | None = None
    title: str = Field(min_length=1, max_length=300)
    description: str = ""


class ListingOut(BaseModel):
    id: str
    workspace_id: str
    story_id: str | None
    cycle_id: str | None
    project_id: str | None = None
    title: str
    description: str
    status: EListingStatus
    posted_by_id: str
    created_at: datetime
    bid_count: int = 0


class BidIn(BaseModel):
    amount_cents: int = Field(gt=0)
    message: str = ""
    delivery_days: int | None = Field(default=None, gt=0)


class BidOut(BaseModel):
    id: str
    listing_id: str
    bidder_id: str
    bidder_name: str | None = None
    amount_cents: int
    message: str
    delivery_days: int | None
    status: EBidStatus
    created_at: datetime


class ContractOut(BaseModel):
    id: str
    listing_id: str
    bid_id: str
    freelancer_id: str
    workspace_id: str
    workspace_slug: str | None = None
    bid_cents: int
    fee_cents: int
    status: EContractStatus
    delivered_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    listing_title: str | None = None
    project_id: str | None = None
    story_id: str | None = None
    cycle_id: str | None = None
