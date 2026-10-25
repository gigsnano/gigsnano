import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.modules.schemas import (
    BulkModuleAssignPayload,
    CreateModulePayload,
    ModuleOut,
    UpdateModulePayload,
)
from gigsnano_api.features.mutations import structured_http
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.features.stories.activity import record_story_activity
from gigsnano_api.features.stories.codes import resolve_codes
from gigsnano_api.features.stories.schemas import StoryOut
from gigsnano_api.models import (
    EProjectActivityType,
    EStoryActivityField,
    EStoryActivityKind,
    Module,
    Project,
    Story,
)
from gigsnano_api.shared.context import (
    WorkspaceContext,
    get_project_or_404,
    get_workspace_context,
    require_project_write_access,
)
from gigsnano_api.shared.serializers import serialize_module, serialize_stories

router = APIRouter(tags=["modules"])


async def _get_module_or_404(db: AsyncSession, project: Project, module_id: str) -> Module:
    module = await db.get(Module, module_id)
    if module is None or module.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found")
    return module


async def _reject_duplicate_name(
    db: AsyncSession, project: Project, name: str, *, exclude_id: str | None = None
) -> None:
    """One module name per project, compared trimmed + case-insensitively — the
    same way a human reads the Modules list (GIN-380)."""
    query = select(Module.id).where(
        Module.project_id == project.id,
        func.lower(func.trim(Module.name)) == name.strip().lower(),
    )
    if exclude_id:
        query = query.where(Module.id != exclude_id)
    if (await db.execute(query)).first() is not None:
        raise structured_http(
            status.HTTP_409_CONFLICT,
            "duplicate_module_name",
            f"A module named '{name.strip()}' already exists in this project.",
            retryable=False,
        )


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/modules/",
    response_model=list[ModuleOut],
)
async def list_modules(
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    modules = (
        await db.execute(
            select(Module).where(Module.project_id == project.id).order_by(Module.created_at)
        )
    ).scalars()
    return [await serialize_module(db, m, ctx.workspace.slug) for m in modules.all()]


@router.post(
    "/workspaces/{workspace_slug}/projects/{project_id}/modules/",
    response_model=ModuleOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_module(
    payload: CreateModulePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    await _reject_duplicate_name(db, project, payload.name)
    module = Module(project_id=project.id, **payload.model_dump(exclude_none=True))
    db.add(module)
    record_activity(
        db, project.id, EProjectActivityType.UPDATED, ctx.user, f"created module {module.name}"
    )
    await db.commit()
    return await serialize_module(db, module, ctx.workspace.slug)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/modules/{module_id}/",
    response_model=ModuleOut,
)
async def get_module(
    module_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    module = await _get_module_or_404(db, project, module_id)
    return await serialize_module(db, module, ctx.workspace.slug)


@router.patch(
    "/workspaces/{workspace_slug}/projects/{project_id}/modules/{module_id}/",
    response_model=ModuleOut,
)
async def update_module(
    module_id: str,
    payload: UpdateModulePayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    module = await _get_module_or_404(db, project, module_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name"):
        await _reject_duplicate_name(db, project, changes["name"], exclude_id=module.id)
    for field, value in changes.items():
        setattr(module, field, value)
    record_activity(
        db, project.id, EProjectActivityType.UPDATED, ctx.user, f"updated module {module.name}"
    )
    await db.commit()
    return await serialize_module(db, module, ctx.workspace.slug)


@router.delete("/workspaces/{workspace_slug}/projects/{project_id}/modules/{module_id}/")
async def delete_module(
    module_id: str,
    on_work_items: str = "reject",
    move_to_module_id: str | None = None,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a module. `on_work_items` is the explicit strategy for items still in
    it: 'reject' (default — 409 while any remain), 'unassign', or 'move' (needs
    `move_to_module_id` in the same project)."""
    module = await _get_module_or_404(db, project, module_id)
    if on_work_items not in ("reject", "unassign", "move"):
        raise structured_http(
            status.HTTP_400_BAD_REQUEST,
            "invalid_strategy",
            "on_work_items must be one of: reject, unassign, move.",
            retryable=False,
        )
    target_id: str | None = None
    if on_work_items == "move":
        if not move_to_module_id:
            raise structured_http(
                status.HTTP_400_BAD_REQUEST,
                "missing_target_module",
                "on_work_items='move' requires move_to_module_id.",
                retryable=False,
            )
        target_id = (await _get_module_or_404(db, project, move_to_module_id)).id

    stories = list(
        (await db.execute(select(Story).where(Story.module_id == module.id))).scalars().all()
    )
    if stories and on_work_items == "reject":
        raise structured_http(
            status.HTTP_409_CONFLICT,
            "module_has_work_items",
            f"{len(stories)} work item(s) still belong to this module.",
            retryable=False,
            work_item_count=len(stories),
        )
    for story in stories:
        story.module_id = target_id
        record_story_activity(
            db,
            story.id,
            ctx.user,
            kind=EStoryActivityKind.PROPERTY,
            field=EStoryActivityField.MODULE,
            summary=f"module deleted ({module.name})",
            old_value=module.id,
            new_value=target_id,
        )
    record_activity(
        db,
        project.id,
        EProjectActivityType.UPDATED,
        ctx.user,
        f"deleted module {module.name} ({on_work_items}, {len(stories)} work items)",
    )
    await db.delete(module)
    await db.commit()
    return {"success": True, "work_items_affected": len(stories), "moved_to": target_id}


@router.post("/workspaces/{workspace_slug}/projects/{project_id}/modules/bulk-assign/")
async def bulk_assign_modules(
    payload: BulkModuleAssignPayload,
    project: Project = Depends(require_project_write_access),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Set (or clear, with module_id=None) `module_id` on many work items in one
    request (GIN-380). Only `module_id` is touched; every other field is left as
    is. Re-running with the same input is a no-op — already-assigned items come
    back under `unchanged`, which is what makes a retry safe."""
    module = (
        await _get_module_or_404(db, project, payload.module_id) if payload.module_id else None
    )
    correlation_id = str(uuid.uuid4())

    found, codes, failed = await resolve_codes(db, project, payload.codes)

    updated: list[dict] = []
    unchanged: list[dict] = []
    new_id = module.id if module else None
    for num, story in found.items():
        entry = {"code": codes[num], "id": story.id, "previous_module_id": story.module_id}
        if story.module_id == new_id:
            unchanged.append(entry)
            continue
        updated.append(entry)
        if payload.dry_run:
            continue
        record_story_activity(
            db,
            story.id,
            ctx.user,
            kind=EStoryActivityKind.PROPERTY,
            field=EStoryActivityField.MODULE,
            summary=f"bulk module assignment ({correlation_id})",
            old_value=story.module_id,
            new_value=new_id,
        )
        story.module_id = new_id

    if payload.dry_run:
        await db.rollback()
    else:
        record_activity(
            db,
            project.id,
            EProjectActivityType.UPDATED,
            ctx.user,
            f"{'assigned' if new_id else 'removed'} {len(updated)} work items "
            f"{'to' if new_id else 'from'} module {module.name if module else ''} "
            f"({correlation_id})",
        )
        await db.commit()

    return {
        "correlation_id": correlation_id,
        "module_id": new_id,
        "dry_run": payload.dry_run,
        "updated": updated,
        "unchanged": unchanged,
        "failed": failed,
        "counts": {
            "updated": len(updated),
            "unchanged": len(unchanged),
            "failed": len(failed),
        },
    }


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/modules/{module_id}/stories/",
    response_model=list[StoryOut],
)
async def module_stories(
    module_id: str,
    project: Project = Depends(get_project_or_404),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    module = await _get_module_or_404(db, project, module_id)
    stories = (
        await db.execute(
            select(Story)
            .where(Story.module_id == module.id, Story.project_id == project.id)
            .order_by(Story.sort_order)
        )
    ).scalars()
    return await serialize_stories(db, list(stories.all()), ctx.workspace.slug)
