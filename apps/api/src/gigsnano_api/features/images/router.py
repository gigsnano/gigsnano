"""Inline image + file upload/serving for the rich editor (work-item
descriptions, comments, docs). Upload and serving are both workspace-auth'd;
upload is JSON+base64 (matching the document upload convention). Images render
inline via a plain `<img>`; generic files (the comment "attach" button) are
served as downloads.

Serving was an unauthenticated capability URL — the UUID was the credential —
on the reasoning that an `<img>` needs to render "without cookies/CORS". That
was wrong in this app (GIN-146): `/api/*` is proxied same-origin from the
frontend and the proxy forwards the session cookie (`lib/api-proxy.ts`, which
exists precisely to make these cookies first-party), so an `<img>` authenticates
like any other request. Meanwhile a UUID leaks wherever a URL leaks — history,
referrers, proxy logs, exported description HTML — and every upload was readable
by anyone who had one.

Both kinds share the `image_assets` table (a generic bytes store); the GET route
sets Content-Disposition based on whether the mime is an inline-renderable
image, so a non-image is always downloaded rather than rendered same-origin."""

import base64
import binascii
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import ImageAsset
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context

router = APIRouter(tags=["images"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
# SVG is deliberately excluded: served same-origin as the API, a hostile <svg>
# opened directly would be an XSS vector. Clipboard/screenshot pastes are raster.
ALLOWED_MIME = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"}


def _decode(data: str, max_bytes: int) -> bytes:
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid base64 data") from err
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty upload")
    if len(raw) > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"Too large (max {max_bytes // (1024 * 1024)} MB)"
        )
    return raw


class UploadImagePayload(BaseModel):
    mime_type: str = Field(max_length=120)
    data: str  # base64-encoded bytes (no `data:` URL prefix)
    file_name: str | None = Field(default=None, max_length=300)
    project_id: str | None = None


class UploadAssetOut(BaseModel):
    id: str
    url: str
    file_name: str | None = None


async def _store_asset(
    db: AsyncSession, ctx: WorkspaceContext, payload: UploadImagePayload, raw: bytes
) -> ImageAsset:
    asset = ImageAsset(
        workspace_id=ctx.workspace.id,
        project_id=payload.project_id,
        file_name=payload.file_name,
        mime_type=payload.mime_type,
        byte_size=len(raw),
        data=raw,
        created_by=ctx.user.id,
    )
    db.add(asset)
    await db.commit()
    return asset


@router.post(
    "/workspaces/{workspace_slug}/images/",
    response_model=UploadAssetOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_image(
    workspace_slug: str,
    payload: UploadImagePayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    if payload.mime_type not in ALLOWED_MIME:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported image type")
    raw = _decode(payload.data, MAX_IMAGE_BYTES)
    asset = await _store_asset(db, ctx, payload, raw)
    return UploadAssetOut(id=asset.id, url=f"/api/workspaces/{workspace_slug}/images/{asset.id}/")


@router.post(
    "/workspaces/{workspace_slug}/files/",
    response_model=UploadAssetOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_file(
    workspace_slug: str,
    payload: UploadImagePayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Generic attachment (the comment 'attach' button) — any file type, served
    as a download so a non-image is never rendered inline same-origin."""
    raw = _decode(payload.data, MAX_FILE_BYTES)
    asset = await _store_asset(db, ctx, payload, raw)
    return UploadAssetOut(
        id=asset.id,
        url=f"/api/workspaces/{workspace_slug}/files/{asset.id}/",
        file_name=asset.file_name,
    )


def _serve(asset: ImageAsset) -> Response:
    # Render images inline; force everything else to download (defense against a
    # same-origin HTML/SVG being opened as a document). nosniff keeps the browser
    # from re-guessing the type.
    inline = asset.mime_type in ALLOWED_MIME
    disposition = "inline" if inline else "attachment"
    name = asset.file_name or "download"
    headers = {
        # private, not public: the response is authenticated now, and a shared
        # cache holding `public` bytes would happily serve one tenant's image to
        # another. The long max-age stays — an asset's bytes never change, the id
        # is per-upload — so browsers still fetch each image exactly once.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(name)}",
    }
    return Response(content=asset.data, media_type=asset.mime_type, headers=headers)


async def _load_asset(db: AsyncSession, ctx: WorkspaceContext, asset_id: str) -> ImageAsset:
    """An asset of `ctx.workspace`, or 404 (GIN-146).

    404 rather than 403 on someone else's asset: a 403 would confirm the id
    exists, turning this into an existence oracle for anyone enumerating ids.
    "Not yours" and "not real" should be indistinguishable from outside.

    The workspace check is the point — membership alone isn't enough. The lookup
    is by id, which is globally unique, so without comparing workspace_id any
    member could read any other workspace's asset by pasting the id behind their
    own slug (the slug used to be decorative).
    """
    asset = await db.get(ImageAsset, asset_id)
    if asset is None or asset.workspace_id != ctx.workspace.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return asset


@router.get("/workspaces/{workspace_slug}/images/{image_id}/")
async def get_image(
    image_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return _serve(await _load_asset(db, ctx, image_id))


@router.get("/workspaces/{workspace_slug}/files/{file_id}/")
async def get_file(
    file_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return _serve(await _load_asset(db, ctx, file_id))
