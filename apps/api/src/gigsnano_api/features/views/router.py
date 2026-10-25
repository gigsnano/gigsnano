"""Saved views: project-scoped (project_views) + workspace-scoped (workspace_views).
Mirrors the frontend view.service + workspace-view.service."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.features.views.schemas import (
    CreateProjectViewPayload,
    CreateWorkspaceViewPayload,
    ProjectViewOut,
    UpdateProjectViewPayload,
    WorkspaceViewOut,
)
from gigsnano_api.models import (
    EViewKind,
    EViewShareScope,
    Project,
    ProjectView,
    ViewFavorite,
    WorkspaceView,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)

router = APIRouter(tags=["views"])

_PP = "/workspaces/{workspace_slug}/projects/{project_id}"
_WP = "/workspaces/{workspace_slug}"


def _project_view_visible(user_id: str):
    return or_(
        ProjectView.owner_id == user_id,
        ProjectView.share_scope == EViewShareScope.PROJECT,
    )


def _workspace_view_visible(user_id: str):
    return or_(
        WorkspaceView.owner_id == user_id,
        WorkspaceView.share_scope == EViewShareScope.PROJECT,
    )


async def _owner_names(db: AsyncSession, owner_ids: set[str]) -> dict[str, str]:
    if not owner_ids:
        return {}
    rows = (
        await db.execute(
            select(User.id, User.display_name).where(User.id.in_(owner_ids))
        )
    ).all()
    return {row[0]: row[1] for row in rows}


async def _favorite_view_ids(
    db: AsyncSession, user_id: str, view_kind: EViewKind, view_ids: list[str]
) -> set[str]:
    if not view_ids:
        return set()
    rows = (
        await db.execute(
            select(ViewFavorite.view_id).where(
                ViewFavorite.user_id == user_id,
                ViewFavorite.view_kind == view_kind,
                ViewFavorite.view_id.in_(view_ids),
            )
        )
    ).scalars()
    return set(rows.all())


def _project_view_out(
    v: ProjectView,
    slug: str,
    *,
    owner_name: str,
    is_favorite: bool,
) -> ProjectViewOut:
    return ProjectViewOut(
        id=v.id,
        workspace_slug=slug,
        project_id=v.project_id,
        name=v.name,
        description=v.description,
        layout=v.layout,
        filter_query=v.filter_query,
        owner_id=v.owner_id,
        owner_name=owner_name,
        share_scope=v.share_scope,
        is_favorite=is_favorite,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


def _workspace_view_out(
    v: WorkspaceView,
    slug: str,
    *,
    owner_name: str,
    is_favorite: bool,
) -> WorkspaceViewOut:
    return WorkspaceViewOut(
        id=v.id,
        workspace_slug=slug,
        name=v.name,
        description=v.description,
        layout=v.layout,
        filter_query=v.filter_query,
        owner_id=v.owner_id,
        owner_name=owner_name,
        share_scope=v.share_scope,
        is_favorite=is_favorite,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


async def _serialize_project_views(
    db: AsyncSession,
    views: list[ProjectView],
    slug: str,
    user_id: str,
) -> list[ProjectViewOut]:
    names = await _owner_names(db, {v.owner_id for v in views})
    favs = await _favorite_view_ids(
        db, user_id, EViewKind.PROJECT, [v.id for v in views]
    )
    return [
        _project_view_out(
            v,
            slug,
            owner_name=names.get(v.owner_id, ""),
            is_favorite=v.id in favs,
        )
        for v in views
    ]


async def _serialize_workspace_views(
    db: AsyncSession,
    views: list[WorkspaceView],
    slug: str,
    user_id: str,
) -> list[WorkspaceViewOut]:
    names = await _owner_names(db, {v.owner_id for v in views})
    favs = await _favorite_view_ids(
        db, user_id, EViewKind.WORKSPACE, [v.id for v in views]
    )
    return [
        _workspace_view_out(
            v,
            slug,
            owner_name=names.get(v.owner_id, ""),
            is_favorite=v.id in favs,
        )
        for v in views
    ]


def _project_view_visible_to(view: ProjectView, user_id: str) -> bool:
    return (
        view.owner_id == user_id
        or view.share_scope == EViewShareScope.PROJECT
    )


def _workspace_view_visible_to(view: WorkspaceView, user_id: str) -> bool:
    return (
        view.owner_id == user_id
        or view.share_scope == EViewShareScope.PROJECT
    )


def _require_view_owner(view: ProjectView | WorkspaceView, user_id: str) -> None:
    if view.owner_id != user_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only the view owner can modify this view"
        )


async def _mutable_project_view_or_error(
    db: AsyncSession, project: Project, view_id: str, user_id: str
) -> ProjectView:
    view = await _project_view_or_404(db, project, view_id)
    if not _project_view_visible_to(view, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "View not found")
    _require_view_owner(view, user_id)
    return view


async def _workspace_view_or_404(
    db: AsyncSession, workspace_id: str, view_id: str
) -> WorkspaceView:
    view = await db.get(WorkspaceView, view_id)
    if view is None or view.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace view not found")
    return view


async def _mutable_workspace_view_or_error(
    db: AsyncSession, workspace_id: str, view_id: str, user_id: str
) -> WorkspaceView:
    view = await _workspace_view_or_404(db, workspace_id, view_id)
    if not _workspace_view_visible_to(view, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace view not found")
    _require_view_owner(view, user_id)
    return view


async def _toggle_favorite(
    db: AsyncSession, user_id: str, view_id: str, view_kind: EViewKind
) -> bool:
    existing = (
        await db.execute(
            select(ViewFavorite).where(
                ViewFavorite.user_id == user_id,
                ViewFavorite.view_id == view_id,
                ViewFavorite.view_kind == view_kind,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        is_favorite = False
    else:
        db.add(
            ViewFavorite(user_id=user_id, view_id=view_id, view_kind=view_kind)
        )
        is_favorite = True
    await db.commit()
    return is_favorite


# ---- Project views ---------------------------------------------------------
@router.get(f"{_PP}/views/", response_model=list[ProjectViewOut])
async def list_project_views(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(ProjectView)
            .where(
                ProjectView.project_id == project.id,
                _project_view_visible(ctx.user.id),
            )
            .order_by(ProjectView.created_at)
        )
    ).scalars()
    views = rows.all()
    return await _serialize_project_views(db, views, ctx.workspace.slug, ctx.user.id)


@router.post(f"{_PP}/views/", response_model=ProjectViewOut, status_code=status.HTTP_201_CREATED)
async def create_project_view(
    payload: CreateProjectViewPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    view = ProjectView(
        project_id=project.id,
        owner_id=ctx.user.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        layout=payload.layout,
        filter_query=payload.filter_query.strip(),
        share_scope=payload.share_scope,
    )
    db.add(view)
    await db.commit()
    await db.refresh(view)
    return _project_view_out(
        view,
        ctx.workspace.slug,
        owner_name=ctx.user.display_name,
        is_favorite=False,
    )


async def _project_view_or_404(db: AsyncSession, project: Project, view_id: str) -> ProjectView:
    view = await db.get(ProjectView, view_id)
    if view is None or view.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "View not found")
    return view


async def _visible_project_view_or_404(
    db: AsyncSession, project: Project, view_id: str, user_id: str
) -> ProjectView:
    view = (
        await db.execute(
            select(ProjectView).where(
                ProjectView.id == view_id,
                ProjectView.project_id == project.id,
                _project_view_visible(user_id),
            )
        )
    ).scalar_one_or_none()
    if view is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "View not found")
    return view


@router.patch(f"{_PP}/views/{{view_id}}/", response_model=ProjectViewOut)
async def update_project_view(
    view_id: str,
    payload: UpdateProjectViewPayload,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    view = await _mutable_project_view_or_error(
        db, project, view_id, ctx.user.id
    )
    # No .strip() here: EViewLayout is a str subclass, so a blanket isinstance(str)
    # strip would coerce the enum to a plain string. Assign values as-is (matches the
    # mock's PATCH, which does not trim on update).
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(view, field, value)
    await db.commit()
    await db.refresh(view)
    favs = await _favorite_view_ids(db, ctx.user.id, EViewKind.PROJECT, [view.id])
    names = await _owner_names(db, {view.owner_id})
    return _project_view_out(
        view,
        ctx.workspace.slug,
        owner_name=names.get(view.owner_id, ctx.user.display_name),
        is_favorite=view.id in favs,
    )


@router.delete(f"{_PP}/views/{{view_id}}/")
async def delete_project_view(
    view_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    view = await _mutable_project_view_or_error(
        db, project, view_id, ctx.user.id
    )
    await db.execute(
        delete(ViewFavorite).where(
            ViewFavorite.view_id == view_id,
            ViewFavorite.view_kind == EViewKind.PROJECT,
        )
    )
    await db.delete(view)
    await db.commit()
    return {"success": True}


async def _toggle_project_view_favorite(
    view_id: str,
    project: Project,
    ctx: WorkspaceContext,
    db: AsyncSession,
) -> ProjectViewOut:
    view = await _visible_project_view_or_404(db, project, view_id, ctx.user.id)
    is_favorite = await _toggle_favorite(
        db, ctx.user.id, view_id, EViewKind.PROJECT
    )
    names = await _owner_names(db, {view.owner_id})
    return _project_view_out(
        view,
        ctx.workspace.slug,
        owner_name=names.get(view.owner_id, ""),
        is_favorite=is_favorite,
    )


@router.post(f"{_PP}/views/{{view_id}}/favorite/", response_model=ProjectViewOut)
async def favorite_project_view_post(
    view_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await _toggle_project_view_favorite(view_id, project, ctx, db)


@router.patch(f"{_PP}/views/{{view_id}}/favorite/", response_model=ProjectViewOut)
async def favorite_project_view_patch(
    view_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    return await _toggle_project_view_favorite(view_id, project, ctx, db)


# ---- Workspace views -------------------------------------------------------
@router.get(f"{_WP}/workspace-views/", response_model=list[WorkspaceViewOut])
async def list_workspace_views(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(WorkspaceView)
            .where(
                WorkspaceView.workspace_id == ctx.workspace.id,
                _workspace_view_visible(ctx.user.id),
            )
            .order_by(WorkspaceView.created_at)
        )
    ).scalars()
    views = rows.all()
    return await _serialize_workspace_views(
        db, views, ctx.workspace.slug, ctx.user.id
    )


@router.post(
    f"{_WP}/workspace-views/", response_model=WorkspaceViewOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_workspace_view(
    payload: CreateWorkspaceViewPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    view = WorkspaceView(
        workspace_id=ctx.workspace.id,
        owner_id=ctx.user.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        layout=payload.layout,
        filter_query=payload.filter_query.strip(),
        share_scope=payload.share_scope,
    )
    db.add(view)
    await db.commit()
    await db.refresh(view)
    return _workspace_view_out(
        view,
        ctx.workspace.slug,
        owner_name=ctx.user.display_name,
        is_favorite=False,
    )


@router.delete(
    f"{_WP}/workspace-views/{{view_id}}/", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_workspace_view(
    view_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    view = await _mutable_workspace_view_or_error(
        db, ctx.workspace.id, view_id, ctx.user.id
    )
    await db.execute(
        delete(ViewFavorite).where(
            ViewFavorite.view_id == view_id,
            ViewFavorite.view_kind == EViewKind.WORKSPACE,
        )
    )
    await db.delete(view)
    await db.commit()
    return None
