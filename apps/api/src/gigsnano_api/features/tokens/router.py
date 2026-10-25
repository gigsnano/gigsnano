"""Portal-facing personal access token CRUD. Complements Task 4's model
(`PersonalAccessToken` + `generate_token()`) and Task 5's Bearer-PAT auth
(`get_current_user`): this is where a signed-in user creates/lists/revokes
their own tokens. The plaintext value is only ever returned from `create` --
it is never stored (only its SHA-256 hash is) and never re-shown by `list`.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.features.tokens.schemas import TokenCreate, TokenCreatedOut, TokenOut
from gigsnano_api.models.tokens import PersonalAccessToken, generate_token

router = APIRouter(prefix="/auth", tags=["tokens"])


@router.post("/tokens/", response_model=TokenCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_token(
    payload: TokenCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    plaintext, digest = generate_token()
    pat = PersonalAccessToken(user_id=user.id, name=payload.name, token_hash=digest)
    db.add(pat)
    await db.commit()
    await db.refresh(pat)
    return TokenCreatedOut(id=pat.id, name=pat.name, token=plaintext, created_at=pat.created_at)


@router.get("/tokens/", response_model=list[TokenOut])
async def list_tokens(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        await db.execute(
            select(PersonalAccessToken)
            .where(PersonalAccessToken.user_id == user.id)
            .order_by(PersonalAccessToken.created_at.desc())
        )
    ).scalars().all()
    return [
        TokenOut(
            id=t.id,
            name=t.name,
            last_used_at=t.last_used_at,
            created_at=t.created_at,
            revoked_at=t.revoked_at,
        )
        for t in rows
    ]


@router.delete("/tokens/{token_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pat = await db.get(PersonalAccessToken, token_id)
    if pat is None or pat.user_id != user.id:
        # Scoped to the current user's own tokens -- a token that exists but
        # belongs to someone else must look identical to one that doesn't
        # exist at all, so we never leak another user's token IDs.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    if pat.revoked_at is None:
        pat.revoked_at = datetime.now(timezone.utc)
        await db.commit()
