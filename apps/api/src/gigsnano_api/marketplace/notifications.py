"""In-app + email notifications for marketplace transitions."""

from gigsnano_api.auth.models import User
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import resolve_and_notify
from gigsnano_api.models import (
    Bid,
    Contract,
    ENotificationKind,
    MarketplaceListing,
    Workspace,
)
from gigsnano_api.shared.context import WorkspaceContext


def _listing_href(workspace_slug: str, listing_id: str) -> str:
    return f"/{workspace_slug}/settings/hired-work?listing={listing_id}"


def _amount(cents: int) -> str:
    return f"${cents / 100:.2f}"


async def notify_bid_received(
    db,
    listing: MarketplaceListing,
    bid: Bid,
    bidder: User,
    workspace: Workspace,
    *,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    await resolve_and_notify(
        db,
        listing.workspace_id,
        listing.posted_by_id,
        trigger_key="marketplace.bid_received",
        context={
            "bidder": bidder.display_name,
            "listing": listing.title,
            "amount": _amount(bid.amount_cents),
        },
        kind=ENotificationKind.SYSTEM,
        href=_listing_href(workspace.slug, listing.id),
        triggered_by_id=bidder.id,
        require_project_member=False,
        background=background,
        provider=provider,
    )


async def notify_bid_accepted(
    db,
    listing: MarketplaceListing,
    bid: Bid,
    contract: Contract,
    ctx: WorkspaceContext,
    *,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    await resolve_and_notify(
        db,
        listing.workspace_id,
        bid.bidder_id,
        trigger_key="marketplace.bid_accepted",
        context={"listing": listing.title},
        kind=ENotificationKind.SYSTEM,
        href=f"/marketplace/contracts/{contract.id}",
        triggered_by_id=ctx.user.id,
        require_active_member=False,
        require_project_member=False,
        background=background,
        provider=provider,
    )


async def notify_bid_declined(
    db,
    listing: MarketplaceListing,
    bid: Bid,
    *,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    await resolve_and_notify(
        db,
        listing.workspace_id,
        bid.bidder_id,
        trigger_key="marketplace.bid_declined",
        context={"listing": listing.title},
        kind=ENotificationKind.SYSTEM,
        href="/marketplace/jobs",
        triggered_by_id=listing.posted_by_id,
        require_active_member=False,
        require_project_member=False,
        background=background,
        provider=provider,
    )


async def notify_work_delivered(
    db,
    listing: MarketplaceListing,
    contract: Contract,
    freelancer: User,
    *,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    workspace = await db.get(Workspace, listing.workspace_id)
    slug = workspace.slug if workspace else ""
    await resolve_and_notify(
        db,
        listing.workspace_id,
        listing.posted_by_id,
        trigger_key="marketplace.delivered",
        context={"freelancer": freelancer.display_name, "listing": listing.title},
        kind=ENotificationKind.SYSTEM,
        href=_listing_href(slug, listing.id),
        triggered_by_id=freelancer.id,
        require_project_member=False,
        background=background,
        provider=provider,
    )


async def notify_changes_requested(
    db,
    listing: MarketplaceListing,
    contract: Contract,
    owner: User,
    *,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    await resolve_and_notify(
        db,
        listing.workspace_id,
        contract.freelancer_id,
        trigger_key="marketplace.changes_requested",
        context={"listing": listing.title},
        kind=ENotificationKind.SYSTEM,
        href=f"/marketplace/contracts/{contract.id}",
        triggered_by_id=owner.id,
        require_active_member=False,
        require_project_member=False,
        background=background,
        provider=provider,
    )


async def notify_approved_paid(
    db,
    listing: MarketplaceListing,
    contract: Contract,
    owner: User,
    *,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    await resolve_and_notify(
        db,
        listing.workspace_id,
        contract.freelancer_id,
        trigger_key="marketplace.payout",
        context={"listing": listing.title, "amount": _amount(contract.bid_cents)},
        kind=ENotificationKind.SYSTEM,
        href=f"/marketplace/contracts/{contract.id}",
        triggered_by_id=owner.id,
        require_active_member=False,
        require_project_member=False,
        background=background,
        provider=provider,
    )


async def notify_contract_cancelled(
    db,
    listing: MarketplaceListing,
    contract: Contract,
    owner: User,
    *,
    background=None,
    provider: EmailProvider | None = None,
) -> None:
    await resolve_and_notify(
        db,
        listing.workspace_id,
        contract.freelancer_id,
        trigger_key="marketplace.cancelled",
        context={"listing": listing.title},
        kind=ENotificationKind.SYSTEM,
        href="/marketplace/jobs",
        triggered_by_id=owner.id,
        require_active_member=False,
        require_project_member=False,
        background=background,
        provider=provider,
    )
