"""Marketplace work-item flow routes — listings, bids, contracts."""

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.billing.deps import get_payment_provider
from gigsnano_api.billing.entitlements import require_entitlement
from gigsnano_api.core.db import get_db
from gigsnano_api.email.deps import get_email_provider
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.documents.router import DocumentOut
from gigsnano_api.features.stories.schemas import StoryOut
from gigsnano_api.marketplace import contracts as C
from gigsnano_api.marketplace import service as S
from gigsnano_api.marketplace.deps import require_listing_admin
from gigsnano_api.marketplace.schemas import (
    BidIn,
    BidOut,
    ContractOut,
    ListingOut,
    PublishListingIn,
)
from gigsnano_api.models import EWorkspaceRole
from gigsnano_api.payments.provider import PaymentProvider
from gigsnano_api.shared.context import WorkspaceContext, require_role

ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)
router = APIRouter(tags=["marketplace-flow"])


@router.post(
    "/workspaces/{workspace_slug}/marketplace/listings/",
    response_model=ListingOut,
)
async def publish_listing(
    payload: PublishListingIn,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    _ent: WorkspaceContext = Depends(require_entitlement("marketplace")),
    db: AsyncSession = Depends(get_db),
):
    out = await S.publish_listing(db, ctx, payload)
    await db.commit()
    return out


@router.get(
    "/workspaces/{workspace_slug}/marketplace/listings/",
    response_model=list[ListingOut],
)
async def list_workspace_listings(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    return await S.list_workspace_listings(db, ctx.workspace.id)


@router.get("/marketplace/listings/", response_model=list[ListingOut])
async def list_public_listings(
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await S.list_public_listings(db)


@router.get("/marketplace/listings/{listing_id}/", response_model=ListingOut)
async def get_listing(
    listing_id: str,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    listing = await S.get_listing_or_404(db, listing_id)
    return await S._listing_out(db, listing)


@router.post(
    "/marketplace/listings/{listing_id}/bids/",
    response_model=BidOut,
)
async def create_bid(
    listing_id: str,
    payload: BidIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    out = await S.create_bid(
        db,
        user,
        listing_id,
        payload.amount_cents,
        payload.message,
        payload.delivery_days,
        background=background,
        email_provider=email_provider,
    )
    await db.commit()
    return out


@router.get(
    "/workspaces/{workspace_slug}/marketplace/listings/{listing_id}/bids/",
    response_model=list[BidOut],
)
async def list_bids(
    listing_id: str,
    _ctx_listing: tuple = Depends(require_listing_admin),
    db: AsyncSession = Depends(get_db),
):
    _ctx, listing = _ctx_listing
    return await S.list_bids_for_listing(db, listing)


@router.delete(
    "/marketplace/listings/{listing_id}/bids/{bid_id}/",
    response_model=BidOut,
)
async def withdraw_bid(
    listing_id: str,
    bid_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    out = await S.withdraw_bid(db, user, listing_id, bid_id)
    await db.commit()
    return out


@router.post(
    "/workspaces/{workspace_slug}/marketplace/listings/{listing_id}/bids/{bid_id}/accept/",
    response_model=ContractOut,
)
async def accept_bid(
    listing_id: str,
    bid_id: str,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    out = await C.accept_bid(
        db, ctx, listing_id, bid_id, provider, background=background, email_provider=email_provider
    )
    await db.commit()
    return out


@router.get(
    "/workspaces/{workspace_slug}/marketplace/contracts/",
    response_model=list[ContractOut],
)
async def list_workspace_contracts(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    return await C.list_workspace_contracts(db, ctx.workspace.id)


@router.get("/marketplace/contracts/", response_model=list[ContractOut])
async def list_my_contracts(
    role: str = "freelancer",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await C.list_contracts_for_user(db, user, role=role)


@router.get("/marketplace/contracts/{contract_id}/", response_model=ContractOut)
async def get_contract(
    contract_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    contract = await C.get_contract_or_404(db, contract_id)
    if user.id not in (contract.freelancer_id,):
        from sqlalchemy import select

        from gigsnano_api.models import EMemberStatus, WorkspaceMember

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
            from fastapi import HTTPException, status

            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    return await C._contract_out(db, contract)


@router.get(
    "/marketplace/contracts/{contract_id}/stories/",
    response_model=list[StoryOut],
)
async def list_contract_stories(
    contract_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await C.list_contract_stories(db, user, contract_id)


@router.get(
    "/marketplace/contracts/{contract_id}/documents/",
    response_model=list[DocumentOut],
)
async def list_contract_documents(
    contract_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await C.list_contract_documents(db, user, contract_id)


@router.post(
    "/marketplace/contracts/{contract_id}/deliver/",
    response_model=ContractOut,
)
async def deliver_contract(
    contract_id: str,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    out = await C.deliver_contract(
        db, user, contract_id, background=background, email_provider=email_provider
    )
    await db.commit()
    return out


@router.post(
    "/workspaces/{workspace_slug}/marketplace/contracts/{contract_id}/approve/",
    response_model=ContractOut,
)
async def approve_contract(
    contract_id: str,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    provider: PaymentProvider = Depends(get_payment_provider),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    out = await C.approve_contract(
        db,
        ctx,
        contract_id,
        provider,
        background=background,
        email_provider=email_provider,
    )
    await db.commit()
    return out


@router.post(
    "/workspaces/{workspace_slug}/marketplace/contracts/{contract_id}/request-changes/",
    response_model=ContractOut,
)
async def request_changes(
    contract_id: str,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    out = await C.request_changes(
        db, ctx, contract_id, background=background, email_provider=email_provider
    )
    await db.commit()
    return out


@router.post(
    "/workspaces/{workspace_slug}/marketplace/contracts/{contract_id}/cancel/",
    response_model=ContractOut,
)
async def cancel_contract(
    contract_id: str,
    background: BackgroundTasks,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    email_provider: EmailProvider = Depends(get_email_provider),
):
    out = await C.cancel_contract(
        db, ctx, contract_id, background=background, email_provider=email_provider
    )
    await db.commit()
    return out
