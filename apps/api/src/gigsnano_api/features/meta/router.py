from fastapi import APIRouter
from pydantic import BaseModel

from gigsnano_api.core.config import settings

router = APIRouter(tags=["meta"])


class MobileMetaOut(BaseModel):
    min_version: str


@router.get("/meta/mobile/", response_model=MobileMetaOut)
async def mobile_meta() -> MobileMetaOut:
    return MobileMetaOut(min_version=settings.mobile_min_version)
