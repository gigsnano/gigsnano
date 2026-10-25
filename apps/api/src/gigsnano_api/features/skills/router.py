from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.skills import bundle
from gigsnano_api.features.skills import service as S
from gigsnano_api.features.skills.schemas import (
    LifecycleTransition,
    PublishSkill,
    SkillOut,
    SkillVersionOut,
)
from gigsnano_api.shared.context import ADMINS, WorkspaceContext, get_workspace_context

router = APIRouter(tags=["skills"])
_WS = "/workspaces/{workspace_slug}/skills"


def _ver_out(v) -> SkillVersionOut:
    return SkillVersionOut(
        id=v.id, version=v.version, digest=v.digest, byte_size=v.byte_size,
        manifest=v.manifest, lifecycle=v.lifecycle,
    )


async def _pkg_out(db: AsyncSession, pkg) -> SkillOut:
    versions = await S.versions_for(db, pkg.id)
    return SkillOut(
        id=pkg.id, name=pkg.name, visibility=pkg.visibility,
        owner_workspace_id=pkg.owner_workspace_id,
        versions=[_ver_out(v) for v in versions],
    )


@router.post(_WS + "/", response_model=SkillVersionOut, status_code=status.HTTP_201_CREATED)
async def publish_skill(
    payload: PublishSkill,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    if payload.visibility == "public" and not await S.user_is_staff(db, ctx.user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only platform staff publish public skills")
    try:
        ver = await S.publish(
            db, workspace_id=ctx.workspace.id, name=payload.name, version=payload.version,
            visibility=payload.visibility, files=payload.files, manifest=payload.manifest,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    except S.VersionConflict as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    await db.commit()
    return _ver_out(ver)


@router.get(_WS + "/", response_model=list[SkillOut])
async def list_skills(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    pkgs = await S.list_visible(db, ctx.workspace.id)
    return [await _pkg_out(db, p) for p in pkgs]


@router.get(_WS + "/{package_id}/", response_model=SkillOut)
async def get_skill(
    package_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        pkg = await S.get_package(db, ctx.workspace.id, package_id)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return await _pkg_out(db, pkg)


@router.get(_WS + "/versions/{version_id}/bundle/")
async def download_bundle(
    version_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        ver = await S.get_version(db, ctx.workspace.id, version_id)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    name = f"{version_id}.tgz"
    return Response(
        content=ver.data,
        media_type="application/gzip",
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}",
            "X-Skill-Digest": ver.digest,
        },
    )


@router.get(_WS + "/versions/{version_id}/instructions/")
async def get_instructions(
    version_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """The version's SKILL.md as text — what an agent needs to follow the skill,
    without unpacking the tgz bundle. Same tenant check as the bundle download."""
    try:
        ver = await S.get_version(db, ctx.workspace.id, version_id)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return {
        "version_id": ver.id,
        "version": ver.version,
        "digest": ver.digest,
        "skill_md": bundle.read_tgz(ver.data).get("SKILL.md", ""),
    }


@router.post(_WS + "/versions/{version_id}/lifecycle/", response_model=SkillVersionOut)
async def transition_lifecycle(
    version_id: str,
    payload: LifecycleTransition,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    try:
        ver = await S.get_version(db, ctx.workspace.id, version_id)  # tenant check
        pkg = await S.get_package(db, ctx.workspace.id, ver.package_id)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    if pkg.visibility == "public":
        if not await S.user_is_staff(db, ctx.user.id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only platform staff change public-skill lifecycle")
    elif ctx.role not in ADMINS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins change lifecycle")

    try:
        ver = await S.transition(db, ver.id, payload.to)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    except ValueError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    await db.commit()
    return _ver_out(ver)
