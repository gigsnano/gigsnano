from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db, utcnow
from gigsnano_api.features.digests.service import effective_channels, load_preference
from gigsnano_api.features.push.schemas import (
    DeviceIn,
    DeviceOut,
    PushPreferencesOut,
    PushPreferencesUpdate,
)
from gigsnano_api.models import DeviceToken, DigestPreference

router = APIRouter(tags=["push"])


@router.post("/me/devices/", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
async def register_device(
    payload: DeviceIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register (or take over) an Expo push token. A phone that changes hands moves
    to the new user, so the previous user stops receiving pushes on it."""
    device = (
        await db.execute(select(DeviceToken).where(DeviceToken.token == payload.token))
    ).scalar_one_or_none()
    if device is None:
        device = DeviceToken(token=payload.token)
        db.add(device)
    device.user_id = user.id
    device.platform = payload.platform
    device.device_name = payload.device_name
    device.last_seen_at = utcnow()
    await db.commit()
    await db.refresh(device)
    return device


@router.delete("/me/devices/{device_id}/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device = await db.get(DeviceToken, device_id)
    if device is None or device.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    await db.delete(device)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _preferences(db: AsyncSession, user: User) -> PushPreferencesOut:
    pref = await load_preference(db, user.id)
    return PushPreferencesOut(
        realtime=user.push_realtime, briefing="push" in effective_channels(pref)
    )


@router.get("/me/push-preferences/", response_model=PushPreferencesOut)
async def get_push_preferences(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await _preferences(db, user)


@router.patch("/me/push-preferences/", response_model=PushPreferencesOut)
async def update_push_preferences(
    payload: PushPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.realtime is not None:
        user.push_realtime = payload.realtime
    if payload.briefing is not None:
        pref = await load_preference(db, user.id)
        if pref is None:
            pref = DigestPreference(user_id=user.id)
            db.add(pref)
        channels = [c for c in effective_channels(pref) if c != "push"]
        pref.channels = channels + ["push"] if payload.briefing else channels
    await db.commit()
    await db.refresh(user)
    return await _preferences(db, user)
