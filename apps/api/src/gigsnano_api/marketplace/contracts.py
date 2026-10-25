"""Contract lifecycle — escrow, delivery, approval."""

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.billing import wallet as W
from gigsnano_api.billing.connect import get_or_create_connect, refresh_status
from gigsnano_api.billing.fees import compute_fee_cents, get_platform_fee_bps
from gigsnano_api.bmad.unlock import apply_story_locks
from gigsnano_api.core.db import utcnow
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.stories.labels import load_story_label_ids
from gigsnano_api.marketplace import notifications as N
from gigsnano_api.marketplace.schemas import ContractOut
from gigsnano_api.models import (
    Bid,
    ConnectAccount,
    Contract,
    ContractAccess,
    Cycle,
    EBidStatus,
    EContractStatus,
    EListingStatus,
    EMemberStatus,
    EStoryStatus,
    EWalletTxnType,
    EWorkspaceRole,
    MarketplaceListing,
    Project,
    Story,
    WalletTransaction,
    Workspace,
    WorkspaceMember,
)
from gigsnano_api.payments.provider import PaymentProvider
from gigsnano_api.shared.context import WorkspaceContext

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


async def _contract_out(db: AsyncSession, contract: Contract) -> ContractOut:
    listing = await db.get(MarketplaceListing, contract.listing_id)
    workspace = await db.get(Workspace, contract.workspace_id)
    project_id: str | None = None
    story_id = listing.story_id if listing else None
    cycle_id = listing.cycle_id if listing else None
    if listing and listing.story_id:
        story = await db.get(Story, listing.story_id)
        if story is not None:
            project_id = story.project_id
    elif listing and listing.cycle_id:
        cycle = await db.get(Cycle, listing.cycle_id)
        if cycle is not None:
            project_id = cycle.project_id
    return ContractOut(
        id=contract.id,
        listing_id=contract.listing_id,
        bid_id=contract.bid_id,
        freelancer_id=contract.freelancer_id,
        workspace_id=contract.workspace_id,
        workspace_slug=workspace.slug if workspace else None,
        bid_cents=contract.bid_cents,
        fee_cents=contract.fee_cents,
        status=contract.status,
        delivered_at=contract.delivered_at,
        completed_at=contract.completed_at,
        created_at=contract.created_at,
        listing_title=listing.title if listing else None,
        project_id=project_id,
        story_id=story_id,
        cycle_id=cycle_id,
    )


async def _freelancer_payouts_enabled(
    db: AsyncSession, provider: PaymentProvider, user_id: str
) -> bool:
    acct = (
        await db.execute(select(ConnectAccount).where(ConnectAccount.user_id == user_id))
    ).scalar_one_or_none()
    if acct is None:
        acct = await get_or_create_connect(db, provider, user_id)
        await refresh_status(db, provider, acct)
    return acct.payouts_enabled


async def accept_bid(
    db: AsyncSession,
    ctx: WorkspaceContext,
    listing_id: str,
    bid_id: str,
    provider: PaymentProvider,
    *,
    background=None,
    email_provider: EmailProvider | None = None,
) -> ContractOut:
    listing = await db.get(MarketplaceListing, listing_id)
    if listing is None or listing.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")
    if listing.status != EListingStatus.OPEN:
        existing = (
            await db.execute(
                select(Contract).where(
                    Contract.listing_id == listing_id,
                    Contract.bid_id == bid_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return await _contract_out(db, existing)
        raise HTTPException(status.HTTP_409_CONFLICT, "Listing is not open")

    bid = await db.get(Bid, bid_id)
    if bid is None or bid.listing_id != listing_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bid not found")
    if bid.status != EBidStatus.PENDING:
        existing = (
            await db.execute(select(Contract).where(Contract.bid_id == bid_id))
        ).scalar_one_or_none()
        if existing is not None:
            return await _contract_out(db, existing)
        raise HTTPException(status.HTTP_409_CONFLICT, "Bid is not pending")

    fee_cents = compute_fee_cents(bid.amount_cents, await get_platform_fee_bps(db))
    contract_id = str(uuid4())

    try:
        txn = await W.hold(
            db, ctx.workspace.id, bid.amount_cents, fee_cents, ref_id=contract_id
        )
    except W.InsufficientBalance:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "Insufficient wallet balance to hire — top up and try again",
        )

    contract = Contract(
        id=contract_id,
        listing_id=listing_id,
        bid_id=bid.id,
        freelancer_id=bid.bidder_id,
        workspace_id=ctx.workspace.id,
        bid_cents=bid.amount_cents,
        fee_cents=fee_cents,
        hold_txn_id=txn.id,
        status=EContractStatus.IN_PROGRESS,
    )
    db.add(contract)

    bid.status = EBidStatus.ACCEPTED
    listing.status = EListingStatus.AWARDED

    other_bids = (
        await db.execute(
            select(Bid).where(
                Bid.listing_id == listing_id,
                Bid.id != bid.id,
                Bid.status == EBidStatus.PENDING,
            )
        )
    ).scalars().all()
    for other in other_bids:
        other.status = EBidStatus.DECLINED
        await N.notify_bid_declined(
            db, listing, other, background=background, provider=email_provider
        )

    access = ContractAccess(
        contract_id=contract.id,
        user_id=bid.bidder_id,
        root_story_id=listing.story_id,
        root_cycle_id=listing.cycle_id,
        active=True,
    )
    db.add(access)

    await N.notify_bid_accepted(
        db, listing, bid, contract, ctx, background=background, provider=email_provider
    )
    await db.flush()
    return await _contract_out(db, contract)


async def deliver_contract(
    db: AsyncSession,
    user: User,
    contract_id: str,
    *,
    background=None,
    email_provider: EmailProvider | None = None,
) -> ContractOut:
    contract = await db.get(Contract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    if contract.freelancer_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your contract")
    if contract.status == EContractStatus.DELIVERED:
        return await _contract_out(db, contract)
    if contract.status != EContractStatus.IN_PROGRESS:
        raise HTTPException(status.HTTP_409_CONFLICT, "Contract is not in progress")

    contract.status = EContractStatus.DELIVERED
    contract.delivered_at = utcnow()
    listing = await db.get(MarketplaceListing, contract.listing_id)
    if listing is not None:
        await N.notify_work_delivered(
            db, listing, contract, user, background=background, provider=email_provider
        )
    await db.flush()
    return await _contract_out(db, contract)


async def request_changes(
    db: AsyncSession,
    ctx: WorkspaceContext,
    contract_id: str,
    *,
    background=None,
    email_provider: EmailProvider | None = None,
) -> ContractOut:
    contract = await _get_owner_contract(db, ctx, contract_id)
    if contract.status == EContractStatus.IN_PROGRESS:
        return await _contract_out(db, contract)
    if contract.status != EContractStatus.DELIVERED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Contract is not awaiting review")

    contract.status = EContractStatus.IN_PROGRESS
    contract.delivered_at = None
    listing = await db.get(MarketplaceListing, contract.listing_id)
    if listing is not None:
        await N.notify_changes_requested(
            db, listing, contract, ctx.user, background=background, provider=email_provider
        )
    await db.flush()
    return await _contract_out(db, contract)


async def cancel_contract(
    db: AsyncSession,
    ctx: WorkspaceContext,
    contract_id: str,
    *,
    background=None,
    email_provider: EmailProvider | None = None,
) -> ContractOut:
    contract = await _get_owner_contract(db, ctx, contract_id)
    if contract.status == EContractStatus.CANCELLED:
        return await _contract_out(db, contract)
    if contract.status in (EContractStatus.COMPLETED, EContractStatus.DELIVERED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot cancel after delivery")

    total = contract.bid_cents + contract.fee_cents
    await W.release(db, ctx.workspace.id, total, ref_id=contract.id)

    contract.status = EContractStatus.CANCELLED
    listing = await db.get(MarketplaceListing, contract.listing_id)
    if listing is not None:
        listing.status = EListingStatus.CLOSED

    await _revoke_access(db, contract.id)
    if listing is not None:
        await N.notify_contract_cancelled(
            db, listing, contract, ctx.user, background=background, provider=email_provider
        )
    await db.flush()
    return await _contract_out(db, contract)


async def approve_contract(
    db: AsyncSession,
    ctx: WorkspaceContext,
    contract_id: str,
    provider: PaymentProvider,
    *,
    background=None,
    email_provider: EmailProvider | None = None,
) -> ContractOut:
    contract = await _get_owner_contract(db, ctx, contract_id)
    if contract.status == EContractStatus.COMPLETED:
        return await _contract_out(db, contract)
    if contract.status != EContractStatus.DELIVERED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Contract is not delivered")

    if not await _freelancer_payouts_enabled(db, provider, contract.freelancer_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Freelancer must complete payout setup before approval",
        )

    acct = (
        await db.execute(
            select(ConnectAccount).where(ConnectAccount.user_id == contract.freelancer_id)
        )
    ).scalar_one()

    await W.capture(
        db,
        ctx.workspace.id,
        contract.bid_cents,
        contract.fee_cents,
        ref_id=contract.id,
    )
    stripe_ref = await provider.transfer(
        contract.bid_cents, acct.stripe_account_id or "", contract.id
    )
    w = await W.get_or_create_wallet(db, ctx.workspace.id)
    db.add(
        WalletTransaction(
            wallet_id=w.id,
            type=EWalletTxnType.PAYOUT,
            amount_cents=contract.bid_cents,
            available_after=w.available_cents,
            held_after=w.held_cents,
            ref_type="contract",
            ref_id=contract.id,
            stripe_ref=stripe_ref,
        )
    )

    contract.status = EContractStatus.COMPLETED
    contract.completed_at = utcnow()
    await _revoke_access(db, contract.id)
    await _complete_work_item(db, contract)

    listing = await db.get(MarketplaceListing, contract.listing_id)
    if listing is not None:
        await N.notify_approved_paid(
            db, listing, contract, ctx.user, background=background, provider=email_provider
        )
    await db.flush()
    return await _contract_out(db, contract)


async def _get_owner_contract(
    db: AsyncSession, ctx: WorkspaceContext, contract_id: str
) -> Contract:
    contract = await db.get(Contract, contract_id)
    if contract is None or contract.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return contract


async def _revoke_access(db: AsyncSession, contract_id: str) -> None:
    rows = (
        await db.execute(
            select(ContractAccess).where(ContractAccess.contract_id == contract_id)
        )
    ).scalars().all()
    for row in rows:
        row.active = False


async def on_work_item_completed(db: AsyncSession, story) -> None:
    """Bind escrow to work-item completion (GIN-185): when a story reaches DONE
    from the board, advance its active marketplace contract to DELIVERED so the
    escrow is ready for the owner to release. Money never moves here — a
    CONTRACTOR can set a story DONE, so the actual capture/payout stays
    owner-gated (approve_contract). Returns the contract it touched, or None.

    ponytail: named ceiling — auto-capture when an OWNER completes the item
    (needs an actor-role gate + Stripe-Connect payout-setup handling)."""
    listing = (
        await db.execute(
            select(MarketplaceListing).where(MarketplaceListing.story_id == story.id)
        )
    ).scalars().first()
    if listing is None:
        return None
    contract = (
        await db.execute(
            select(Contract).where(
                Contract.listing_id == listing.id,
                Contract.status == EContractStatus.IN_PROGRESS,
            )
        )
    ).scalars().first()
    if contract is None:
        return None
    contract.status = EContractStatus.DELIVERED
    contract.delivered_at = utcnow()
    return contract


async def _complete_work_item(db: AsyncSession, contract: Contract) -> None:
    listing = await db.get(MarketplaceListing, contract.listing_id)
    if listing is None:
        return

    if listing.story_id is not None:
        story = await db.get(Story, listing.story_id)
        if story is None:
            return
        project = await db.get(Project, story.project_id)
        if project is None:
            return
        story.status = EStoryStatus.DONE
        if story.bmad_workflow is not None:
            bmad_stories = list(
                (
                    await db.execute(
                        select(Story).where(
                            Story.project_id == project.id,
                            Story.bmad_workflow.is_not(None),
                        )
                    )
                ).scalars()
            )
            apply_story_locks(bmad_stories, project.has_ui)
        return

    if listing.cycle_id is not None:
        stories = (
            await db.execute(select(Story).where(Story.cycle_id == listing.cycle_id))
        ).scalars().all()
        project: Project | None = None
        for story in stories:
            story.status = EStoryStatus.DONE
            if story.bmad_workflow is not None and project is None:
                project = await db.get(Project, story.project_id)
        if project is not None:
            bmad_stories = list(
                (
                    await db.execute(
                        select(Story).where(
                            Story.project_id == project.id,
                            Story.bmad_workflow.is_not(None),
                        )
                    )
                ).scalars()
            )
            apply_story_locks(bmad_stories, project.has_ui)


async def list_contracts_for_user(
    db: AsyncSession, user: User, *, role: str
) -> list[ContractOut]:
    if role == "freelancer":
        rows = (
            await db.execute(
                select(Contract)
                .where(Contract.freelancer_id == user.id)
                .order_by(Contract.created_at.desc())
            )
        ).scalars().all()
    elif role == "owner":
        # Owner sees contracts in workspaces they belong to — simplified: all contracts
        # where user is admin is handled at router with workspace filter
        rows = (
            await db.execute(select(Contract).order_by(Contract.created_at.desc()))
        ).scalars().all()
    else:
        rows = []
    return [await _contract_out(db, c) for c in rows]


async def list_workspace_contracts(
    db: AsyncSession, workspace_id: str
) -> list[ContractOut]:
    rows = (
        await db.execute(
            select(Contract)
            .where(Contract.workspace_id == workspace_id)
            .order_by(Contract.created_at.desc())
        )
    ).scalars().all()
    return [await _contract_out(db, c) for c in rows]


async def get_contract_or_404(db: AsyncSession, contract_id: str) -> Contract:
    contract = await db.get(Contract, contract_id)
    if contract is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return contract


async def _assert_contract_reader(db: AsyncSession, contract: Contract, user: User) -> None:
    if contract.freelancer_id == user.id:
        return
    member = (
        await db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == contract.workspace_id,
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
                WorkspaceMember.role.in_(ADMINS),
            )
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")


async def list_contract_stories(
    db: AsyncSession, user: User, contract_id: str
) -> list:
    """Stories in the contract's scoped subtree — for the freelancer work board."""
    from gigsnano_api.shared.serializers import serialize_story, sub_issue_counts

    contract = await get_contract_or_404(db, contract_id)
    await _assert_contract_reader(db, contract, user)
    if contract.freelancer_id == user.id and contract.status != EContractStatus.IN_PROGRESS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Contract is not active")

    listing = await db.get(MarketplaceListing, contract.listing_id)
    if listing is None:
        return []

    workspace = await db.get(Workspace, contract.workspace_id)
    slug = workspace.slug if workspace else ""

    if listing.story_id:
        story = await db.get(Story, listing.story_id)
        stories = [story] if story is not None else []
    elif listing.cycle_id:
        stories = list(
            (
                await db.execute(
                    select(Story)
                    .where(Story.cycle_id == listing.cycle_id)
                    .order_by(Story.sort_order)
                )
            ).scalars().all()
        )
    else:
        stories = []

    counts = await sub_issue_counts(db, [s.id for s in stories])
    ids = {s.project_id for s in stories}
    idents = dict(
        (await db.execute(select(Project.id, Project.identifier).where(Project.id.in_(ids)))).all()
    )
    labels = await load_story_label_ids(db, [s.id for s in stories])
    return [
        serialize_story(s, slug, counts, idents.get(s.project_id, ""), label_ids=labels)
        for s in stories
    ]


async def _contract_project_id(db: AsyncSession, listing: MarketplaceListing | None) -> str | None:
    if listing is None:
        return None
    if listing.story_id:
        story = await db.get(Story, listing.story_id)
        return story.project_id if story is not None else None
    if listing.cycle_id:
        cycle = await db.get(Cycle, listing.cycle_id)
        return cycle.project_id if cycle is not None else None
    return None


async def list_contract_documents(db: AsyncSession, user: User, contract_id: str) -> list:
    """Read-only project docs for a contractor's @-mention picker."""
    from sqlalchemy.orm import selectinload

    from gigsnano_api.features.documents.router import serialize_document
    from gigsnano_api.models import Artifact, Project

    contract = await get_contract_or_404(db, contract_id)
    await _assert_contract_reader(db, contract, user)
    if contract.freelancer_id == user.id and contract.status != EContractStatus.IN_PROGRESS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Contract is not active")

    listing = await db.get(MarketplaceListing, contract.listing_id)
    project_id = await _contract_project_id(db, listing)
    if project_id is None:
        return []

    workspace = await db.get(Workspace, contract.workspace_id)
    slug = workspace.slug if workspace else ""

    rows = (
        await db.execute(
            select(Artifact, Project.name)
            .join(Project, Project.id == Artifact.project_id)
            .options(selectinload(Artifact.comments))
            .where(Artifact.project_id == project_id)
            .order_by(Artifact.created_at)
        )
    ).all()
    return [serialize_document(a, slug, name) for a, name in rows]
