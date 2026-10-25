"""Issue, rotate and revoke the mobile app's refresh-token families."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import utcnow
from gigsnano_api.core.security import create_token
from gigsnano_api.models import MobileRefreshToken
from gigsnano_api.models.tokens import hash_token

REFRESH_PREFIX = "gnr_"  # nosec B105 - public prefix; the secret is the generated remainder


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int


class InvalidRefreshToken(Exception):
    """The presented refresh token is unknown, expired, revoked or its user is gone."""


def _as_utc(value: datetime) -> datetime:
    # sqlite returns naive datetimes for DateTime(timezone=True); Postgres returns aware.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


async def issue_token_pair(
    db: AsyncSession, user_id: str, *, family_id: str | None = None, device_name: str = ""
) -> TokenPair:
    plaintext = REFRESH_PREFIX + secrets.token_urlsafe(48)
    db.add(
        MobileRefreshToken(
            user_id=user_id,
            family_id=family_id or str(uuid4()),
            token_hash=hash_token(plaintext),
            device_name=device_name[:120],
            expires_at=utcnow() + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    await db.flush()
    return TokenPair(
        access_token=create_token(user_id, "access"),
        refresh_token=plaintext,
        expires_in=settings.access_token_ttl_minutes * 60,
    )


async def _find(db: AsyncSession, presented: str) -> MobileRefreshToken | None:
    return (
        await db.execute(
            select(MobileRefreshToken).where(MobileRefreshToken.token_hash == hash_token(presented))
        )
    ).scalar_one_or_none()


async def _revoke_family(db: AsyncSession, family_id: str, now: datetime) -> None:
    await db.execute(
        update(MobileRefreshToken)
        .where(MobileRefreshToken.family_id == family_id, MobileRefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


async def rotate_refresh_token(db: AsyncSession, presented: str) -> TokenPair:
    row = await _find(db, presented)
    if row is None:
        raise InvalidRefreshToken("unknown")
    now = utcnow()
    if row.revoked_at is not None:
        # A revoked token came back: it was copied. Kill every token in its family.
        await _revoke_family(db, row.family_id, now)
        await db.commit()
        raise InvalidRefreshToken("reused")
    if _as_utc(row.expires_at) <= now:
        raise InvalidRefreshToken("expired")
    user = await db.get(User, row.user_id)
    if user is None or user.is_suspended:
        await _revoke_family(db, row.family_id, now)
        await db.commit()
        raise InvalidRefreshToken("user")

    # Claim the token atomically: only one concurrent caller can flip revoked_at from NULL.
    claimed = await db.execute(
        update(MobileRefreshToken)
        .where(MobileRefreshToken.id == row.id, MobileRefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    if claimed.rowcount != 1:  # type: ignore[attr-defined]
        await _revoke_family(db, row.family_id, now)
        await db.commit()
        raise InvalidRefreshToken("reused")
    pair = await issue_token_pair(
        db, row.user_id, family_id=row.family_id, device_name=row.device_name
    )
    await db.commit()
    return pair


async def revoke_refresh_family(db: AsyncSession, presented: str) -> None:
    row = await _find(db, presented)
    if row is None:
        return
    await _revoke_family(db, row.family_id, utcnow())
    await db.commit()
