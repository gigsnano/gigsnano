"""Slack OAuth install + channel config (GIN-23a). Mirrors `sync/router.py`'s
GitHub OAuth App endpoints (install-url -> oauth/callback -> connect), plus a
channel picker and a disconnect, all admin/owner-gated except status."""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import EWorkspaceRole, SlackConnection
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context, require_role
from gigsnano_api.sync.github_state import sign_state, verify_state
from gigsnano_api.sync.slack_oauth import (
    SlackOAuth,
    SlackOAuthError,
    get_slack_oauth,
)
from gigsnano_api.sync.token_crypto import decrypt_token, encrypt_token
from gigsnano_api.webhooks.events import WEBHOOK_EVENTS

router = APIRouter(tags=["slack"])
_W = "/workspaces/{workspace_slug}"
ADMINS = (EWorkspaceRole.ADMIN, EWorkspaceRole.OWNER)


class SlackStatusOut(BaseModel):
    connected: bool
    team_name: str | None = None
    default_channel_name: str | None = None
    notify_events: list[str] = []


class OAuthCallbackPayload(BaseModel):
    code: str
    state: str


class ChannelOut(BaseModel):
    id: str
    name: str


class UpdateSlackConfigPayload(BaseModel):
    default_channel_id: str | None = None
    default_channel_name: str | None = None
    notify_events: list[str] | None = None


async def _get_connection(db: AsyncSession, workspace_id: str) -> SlackConnection | None:
    return (
        await db.execute(
            select(SlackConnection).where(SlackConnection.workspace_id == workspace_id)
        )
    ).scalar_one_or_none()


def _serialize(conn: SlackConnection | None) -> SlackStatusOut:
    if conn is None:
        return SlackStatusOut(connected=False)
    return SlackStatusOut(
        connected=True,
        team_name=conn.team_name,
        default_channel_name=conn.default_channel_name,
        notify_events=list(conn.notify_events or []),
    )


@router.get(f"{_W}/slack/", response_model=SlackStatusOut)
async def slack_status(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return _serialize(await _get_connection(db, ctx.workspace.id))


@router.get(f"{_W}/slack/install-url/")
async def slack_install_url(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    oauth: SlackOAuth = Depends(get_slack_oauth),
) -> dict[str, str]:
    return {"url": oauth.authorize_url(sign_state(ctx.workspace.slug, ctx.user.id))}


@router.post(f"{_W}/slack/oauth/callback/", response_model=SlackStatusOut)
async def slack_oauth_callback(
    payload: OAuthCallbackPayload,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    oauth: SlackOAuth = Depends(get_slack_oauth),
):
    try:
        ws_slug, state_user_id = verify_state(payload.state)
    except ValueError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(err))
    if ws_slug != ctx.workspace.slug or state_user_id != ctx.user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "State/workspace/user mismatch")
    try:
        result = await oauth.exchange_code(payload.code)
    except (SlackOAuthError, httpx.HTTPError) as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"OAuth exchange failed: {err}")

    conn = await _get_connection(db, ctx.workspace.id)
    if conn is None:
        conn = SlackConnection(
            workspace_id=ctx.workspace.id,
            access_token_encrypted=encrypt_token(result.access_token),
            team_id=result.team_id,
            team_name=result.team_name,
            bot_user_id=result.bot_user_id,
            notify_events=sorted(WEBHOOK_EVENTS),
            connected_by=ctx.user.id,
        )
        db.add(conn)
    else:
        conn.access_token_encrypted = encrypt_token(result.access_token)
        conn.team_id = result.team_id
        conn.team_name = result.team_name
        conn.bot_user_id = result.bot_user_id
        conn.connected_by = ctx.user.id
    await db.commit()
    return _serialize(conn)


@router.get(f"{_W}/slack/channels/", response_model=list[ChannelOut])
async def slack_channels(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
    oauth: SlackOAuth = Depends(get_slack_oauth),
):
    conn = await _get_connection(db, ctx.workspace.id)
    if conn is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect Slack first")
    try:
        channels = await oauth.list_channels(decrypt_token(conn.access_token_encrypted))
    except (SlackOAuthError, httpx.HTTPError) as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Could not list channels: {err}")
    return [ChannelOut(id=c.id, name=c.name) for c in channels]


@router.patch(f"{_W}/slack/", response_model=SlackStatusOut)
async def slack_update_config(
    payload: UpdateSlackConfigPayload,
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_connection(db, ctx.workspace.id)
    if conn is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect Slack first")
    if payload.default_channel_id is not None:
        conn.default_channel_id = payload.default_channel_id
        conn.default_channel_name = payload.default_channel_name
    if payload.notify_events is not None:
        unknown = [e for e in payload.notify_events if e not in WEBHOOK_EVENTS]
        if unknown:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown event(s): {', '.join(unknown)}"
            )
        conn.notify_events = payload.notify_events
    await db.commit()
    return _serialize(conn)


@router.post(f"{_W}/slack/disconnect/")
async def slack_disconnect(
    ctx: WorkspaceContext = Depends(require_role(*ADMINS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    conn = await _get_connection(db, ctx.workspace.id)
    if conn is not None:
        await db.delete(conn)
        await db.commit()
    return {"success": True}
