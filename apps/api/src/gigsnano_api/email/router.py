from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.email.tokens import EmailTokenError, make_email_token, verify_email_token

router = APIRouter(tags=["email"])


def make_unsubscribe_url(user_id: str) -> str:
    token = make_email_token("unsub", user_id, ttl_seconds=31536000)
    return f"{settings.app_base_url}/api/email/unsubscribe/{token}/"


@router.get("/email/unsubscribe/{token}/", response_class=HTMLResponse)
async def unsubscribe(token: str, db: AsyncSession = Depends(get_db)):
    try:
        user_id = verify_email_token("unsub", token)
    except EmailTokenError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid link")
    user = await db.get(User, user_id)
    if user is not None:
        user.email_digest = False
        await db.commit()
    return "<p>You've been unsubscribed from notification emails.</p>"
