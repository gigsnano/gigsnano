from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.core.pagination import OffsetPageOut

router = APIRouter(prefix="/users", tags=["users"])


class UserOut(BaseModel):
    """Matches the frontend's IUser (src/types/user.ts)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    display_name: str
    email: str
    avatar_url: str | None


@router.get("/", response_model=OffsetPageOut[UserOut])
async def list_users(
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    count_stmt = select(func.count(User.id))
    list_stmt = select(User).order_by(User.display_name)
    if q and q.strip():
        like = f"%{q.strip()}%"
        clause = (User.display_name.ilike(like)) | (User.email.ilike(like))
        count_stmt = count_stmt.where(clause)
        list_stmt = list_stmt.where(clause)
    total = int((await db.scalar(count_stmt)) or 0)
    rows = (await db.execute(list_stmt.limit(limit).offset(offset))).scalars().all()
    return OffsetPageOut(items=list(rows), total=total, limit=limit, offset=offset)


@router.get("/{user_id}/", response_model=UserOut)
async def get_user(
    user_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user
