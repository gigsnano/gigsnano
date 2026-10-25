from contextvars import ContextVar
from datetime import datetime, timezone

import jwt
from mcp.server.auth.provider import AccessToken, TokenVerifier
from sqlalchemy import select

from gigsnano_api.core import db
from gigsnano_api.core.security import decode_mcp_token
from gigsnano_api.models.tokens import PersonalAccessToken, hash_token

current_bearer: ContextVar[str] = ContextVar("current_bearer", default="")


def set_bearer(token: str) -> None:
    current_bearer.set(token)


def get_bearer() -> str:
    return current_bearer.get()


class PatTokenVerifier(TokenVerifier):
    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            claims = decode_mcp_token(token)
            set_bearer(token)
            scope = claims.get("scope", "mcp")
            scopes = scope.split() if isinstance(scope, str) else list(scope)
            exp = claims.get("exp")
            return AccessToken(
                token=token,
                client_id=claims.get("client_id", "oauth"),
                subject=claims["sub"],
                scopes=scopes,
                expires_at=int(exp) if exp is not None else None,
            )
        except jwt.InvalidTokenError:
            pass

        async with db.async_session() as session:
            pat = (
                await session.execute(
                    select(PersonalAccessToken).where(
                        PersonalAccessToken.token_hash == hash_token(token),
                        PersonalAccessToken.revoked_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if pat is None:
                return None
            pat.last_used_at = datetime.now(timezone.utc)
            await session.commit()
            set_bearer(token)
            return AccessToken(
                token=token,
                client_id="pat",
                subject=pat.user_id,
                scopes=["mcp"],
                expires_at=None,
            )
