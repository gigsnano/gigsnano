import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.context_engine.webhook import projects_for_push, verify_signature
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.workspace.code_index import run_index_in_fresh_session

router = APIRouter(tags=["context-engine"])

_DEBOUNCE_SECONDS = 5.0
_pending: set[str] = set()  # ponytail: in-process debounce; move to Redis if multi-worker


async def _debounced_index(project_id: str) -> None:
    if project_id in _pending:
        return
    _pending.add(project_id)
    try:
        await asyncio.sleep(_DEBOUNCE_SECONDS)
    finally:
        _pending.discard(project_id)
    await run_index_in_fresh_session(project_id)


@router.post("/webhooks/github/push", status_code=status.HTTP_202_ACCEPTED)
async def github_push(
    request: Request,
    background: BackgroundTasks,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not settings.github_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured.")
    body = await request.body()
    if not verify_signature(settings.github_webhook_secret, body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Bad signature.")
    if x_github_event != "push":
        return {"scheduled": 0}  # ignore non-push events
    payload = await request.json()
    ids = await projects_for_push(
        db, payload.get("repository", {}).get("full_name", ""), payload.get("ref", "")
    )
    for pid in ids:
        background.add_task(_debounced_index, pid)
    return {"scheduled": len(ids)}
