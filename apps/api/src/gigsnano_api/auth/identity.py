"""Which existing user a Google or Apple identity belongs to.

Shared by web Google sign-in (which then creates the account if there is none) and
mobile sign-in (which never creates accounts). Lookup is by provider subject first,
then by a provider-verified email, which links the subject to that user.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.apple import AppleIdentity
from gigsnano_api.auth.google import GoogleIdentity
from gigsnano_api.auth.models import User


async def _by_email(db: AsyncSession, email: str) -> User | None:
    return (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def find_user_for_google(db: AsyncSession, identity: GoogleIdentity) -> User | None:
    user = (
        await db.execute(select(User).where(User.google_sub == identity.sub))
    ).scalar_one_or_none()
    if user is not None or not identity.email or not identity.email_verified:
        return user
    user = await _by_email(db, identity.email)
    if user is not None and user.google_sub is not None:
        return None  # already linked to a different Google account
    if user is not None:
        user.google_sub = identity.sub
        if user.avatar_url is None:
            user.avatar_url = identity.picture
        user.email_verified = True
    return user


async def find_user_for_apple(db: AsyncSession, identity: AppleIdentity) -> User | None:
    user = (
        await db.execute(select(User).where(User.apple_sub == identity.sub))
    ).scalar_one_or_none()
    if user is not None or not identity.email or not identity.email_verified:
        return user
    user = await _by_email(db, identity.email)
    if user is not None and user.apple_sub is not None:
        return None  # already linked to a different Apple account
    if user is not None:
        user.apple_sub = identity.sub
        user.email_verified = True
    return user
