"""Marketplace listing and bid business logic."""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.marketplace import notifications as N
from gigsnano_api.marketplace.schemas import BidOut, ListingOut, PublishListingIn
from gigsnano_api.models import (
    Bid,
    Cycle,
    EBidStatus,
    EListingStatus,
    EMemberStatus,
    MarketplaceListing,
    Project,
    Story,
    Workspace,
    WorkspaceMember,
)
from gigsnano_api.shared.context import WorkspaceContext


async def _resolve_publish_target(
    db: AsyncSession, ctx: WorkspaceContext, payload: PublishListingIn
) -> tuple[str | None, str | None, str | None]:
    has_story = payload.story_id is not None
    has_cycle = payload.cycle_id is not None
    if has_story == has_cycle:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Provide exactly one of story_id or cycle_id",
        )

    project_id: str | None = None
    if payload.story_id is not None:
        story = await db.get(Story, payload.story_id)
        if story is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
        project = await db.get(Project, story.project_id)
        if project is None or project.workspace_id != ctx.workspace.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
        project_id = project.id
        return payload.story_id, None, project_id

    cycle = await db.get(Cycle, payload.cycle_id)
    if cycle is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cycle not found")
    project = await db.get(Project, cycle.project_id)
    if project is None or project.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cycle not found")
    return None, payload.cycle_id, project.id


async def _listing_out(db: AsyncSession, listing: MarketplaceListing) -> ListingOut:
    bid_count = (
        await db.execute(
            select(func.count(Bid.id)).where(
                Bid.listing_id == listing.id,
                Bid.status != EBidStatus.WITHDRAWN,
            )
        )
    ).scalar_one()

    project_id: str | None = None
    if listing.story_id is not None:
        story = await db.get(Story, listing.story_id)
        if story is not None:
            project_id = story.project_id
    elif listing.cycle_id is not None:
        cycle = await db.get(Cycle, listing.cycle_id)
        if cycle is not None:
            project_id = cycle.project_id

    return ListingOut(
        id=listing.id,
        workspace_id=listing.workspace_id,
        story_id=listing.story_id,
        cycle_id=listing.cycle_id,
        project_id=project_id,
        title=listing.title,
        description=listing.description,
        status=listing.status,
        posted_by_id=listing.posted_by_id,
        created_at=listing.created_at,
        bid_count=bid_count,
    )


async def publish_listing(
    db: AsyncSession, ctx: WorkspaceContext, payload: PublishListingIn
) -> ListingOut:
    story_id, cycle_id, _project_id = await _resolve_publish_target(db, ctx, payload)
    listing = MarketplaceListing(
        workspace_id=ctx.workspace.id,
        story_id=story_id,
        cycle_id=cycle_id,
        title=payload.title,
        description=payload.description,
        status=EListingStatus.OPEN,
        posted_by_id=ctx.user.id,
    )
    db.add(listing)
    await db.flush()
    return await _listing_out(db, listing)


async def list_workspace_listings(
    db: AsyncSession, workspace_id: str
) -> list[ListingOut]:
    rows = (
        await db.execute(
            select(MarketplaceListing)
            .where(MarketplaceListing.workspace_id == workspace_id)
            .order_by(MarketplaceListing.created_at.desc())
        )
    ).scalars().all()
    return [await _listing_out(db, row) for row in rows]


async def list_public_listings(db: AsyncSession) -> list[ListingOut]:
    rows = (
        await db.execute(
            select(MarketplaceListing)
            .where(MarketplaceListing.status.in_((EListingStatus.OPEN, EListingStatus.AWARDED)))
            .order_by(MarketplaceListing.created_at.desc())
        )
    ).scalars().all()
    return [await _listing_out(db, row) for row in rows]


async def get_listing_or_404(db: AsyncSession, listing_id: str) -> MarketplaceListing:
    listing = await db.get(MarketplaceListing, listing_id)
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    return listing


async def _is_workspace_member(db: AsyncSession, workspace_id: str, user_id: str) -> bool:
    row = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).scalar_one_or_none()
    return row is not None


def _bid_out(bid: Bid, bidder: User | None = None) -> BidOut:
    return BidOut(
        id=bid.id,
        listing_id=bid.listing_id,
        bidder_id=bid.bidder_id,
        bidder_name=bidder.display_name if bidder else None,
        amount_cents=bid.amount_cents,
        message=bid.message,
        delivery_days=bid.delivery_days,
        status=bid.status,
        created_at=bid.created_at,
    )


async def create_bid(
    db: AsyncSession,
    user: User,
    listing_id: str,
    amount_cents: int,
    message: str,
    delivery_days: int | None,
    *,
    background=None,
    email_provider: EmailProvider | None = None,
) -> BidOut:
    listing = await get_listing_or_404(db, listing_id)
    if listing.status != EListingStatus.OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "Listing is not open for bids")

    if await _is_workspace_member(db, listing.workspace_id, user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace members cannot bid on their own listing")

    existing = (
        await db.execute(
            select(Bid).where(
                Bid.listing_id == listing_id,
                Bid.bidder_id == user.id,
                Bid.status == EBidStatus.PENDING,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a pending bid on this listing")

    bid = Bid(
        listing_id=listing_id,
        bidder_id=user.id,
        amount_cents=amount_cents,
        message=message,
        delivery_days=delivery_days,
        status=EBidStatus.PENDING,
    )
    db.add(bid)
    await db.flush()

    listing = await get_listing_or_404(db, listing_id)
    workspace = await db.get(Workspace, listing.workspace_id)
    if workspace is not None:
        await N.notify_bid_received(
            db, listing, bid, user, workspace, background=background, provider=email_provider
        )

    return _bid_out(bid, user)


async def list_bids_for_listing(
    db: AsyncSession, listing: MarketplaceListing
) -> list[BidOut]:
    rows = (
        await db.execute(
            select(Bid, User)
            .join(User, User.id == Bid.bidder_id)
            .where(Bid.listing_id == listing.id, Bid.status != EBidStatus.WITHDRAWN)
            .order_by(Bid.created_at.desc())
        )
    ).all()
    return [_bid_out(bid, bidder) for bid, bidder in rows]


async def withdraw_bid(db: AsyncSession, user: User, listing_id: str, bid_id: str) -> BidOut:
    bid = await db.get(Bid, bid_id)
    if bid is None or bid.listing_id != listing_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bid not found")
    if bid.bidder_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your bid")
    if bid.status != EBidStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending bids can be withdrawn")
    bid.status = EBidStatus.WITHDRAWN
    await db.flush()
    return _bid_out(bid, user)
