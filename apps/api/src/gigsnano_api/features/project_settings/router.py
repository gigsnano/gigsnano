"""Project-scoped work-item configuration: labels, states, features, estimates,
automations. Mirrors the frontend projectSettingsService. All routes are
project-scoped via get_project_or_404 (auth + tenancy enforced there)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.features.projects.schemas import (
    CreateCustomFieldPayload,
    CreateProjectAutomationPayload,
    CreateProjectEstimatePayload,
    CreateProjectLabelPayload,
    CreateProjectStatePayload,
    CustomFieldOut,
    ProjectAutomationOut,
    ProjectEstimateOut,
    ProjectFeatureOut,
    ProjectLabelOut,
    ProjectStateOut,
    UpdateCustomFieldPayload,
    UpdateFeaturePayload,
)
from gigsnano_api.models import (
    ECustomFieldType,
    Project,
    ProjectAutomation,
    ProjectCustomField,
    ProjectEstimate,
    ProjectFeature,
    ProjectLabel,
    ProjectState,
    Story,
    StoryLabel,
)
from gigsnano_api.shared.context import get_project_or_404, require_project_permission
from gigsnano_api.shared.project_rbac import EProjectPermission

router = APIRouter(tags=["project-settings"])

_P = "/workspaces/{workspace_slug}/projects/{project_id}"

_OK = {"success": True}

_FEATURE_ORDER = case(
    {"cycles": 0, "modules": 1, "views": 2, "pages": 3},
    value=ProjectFeature.key,
    else_=99,
)


# ---- Labels ----------------------------------------------------------------
@router.get(f"{_P}/labels/", response_model=list[ProjectLabelOut])
async def list_labels(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(ProjectLabel)
            .where(ProjectLabel.project_id == project.id)
            .order_by(ProjectLabel.created_at)
        )
    ).scalars()
    return list(rows.all())


@router.post(
    f"{_P}/labels/", response_model=ProjectLabelOut, status_code=status.HTTP_201_CREATED
)
async def create_label(
    payload: CreateProjectLabelPayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
):
    label = ProjectLabel(project_id=project.id, name=payload.name.strip(), color=payload.color)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return label


@router.delete(f"{_P}/labels/{{label_id}}/")
async def delete_label(
    label_id: str,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    label = await db.get(ProjectLabel, label_id)
    if label is None or label.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Label not found")
    # Explicit delete so behavior holds on sqlite (FK CASCADE is a no-op there):
    # removing a label detaches it from every work item that carried it (GIN-475).
    await db.execute(delete(StoryLabel).where(StoryLabel.label_id == label_id))
    await db.delete(label)
    await db.commit()
    return _OK


# ---- Estimates -------------------------------------------------------------
@router.get(f"{_P}/estimates/", response_model=list[ProjectEstimateOut])
async def list_estimates(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(ProjectEstimate)
            .where(ProjectEstimate.project_id == project.id)
            .order_by(ProjectEstimate.created_at)
        )
    ).scalars()
    return list(rows.all())


@router.post(
    f"{_P}/estimates/",
    response_model=ProjectEstimateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_estimate(
    payload: CreateProjectEstimatePayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
):
    est = ProjectEstimate(
        project_id=project.id,
        name=payload.name.strip(),
        type=payload.type,
        description=payload.description.strip(),
    )
    db.add(est)
    await db.commit()
    await db.refresh(est)
    return est


@router.delete(f"{_P}/estimates/{{estimate_id}}/")
async def delete_estimate(
    estimate_id: str,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    est = await db.get(ProjectEstimate, estimate_id)
    if est is None or est.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Estimate not found")
    await db.execute(
        update(Story)
        .where(Story.estimate_id == estimate_id)
        .values(estimate_id=None, estimate_points=None)
    )
    await db.delete(est)
    await db.commit()
    return _OK


# ---- Custom fields ----------------------------------------------------------
def _validate_custom_field_options(
    field_type: ECustomFieldType, options: list[str] | None
) -> None:
    if field_type == ECustomFieldType.SELECT:
        if not options:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "select fields require non-empty options"
            )
    elif options is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "options are only allowed for select fields"
        )


@router.get(f"{_P}/custom-fields/", response_model=list[CustomFieldOut])
async def list_custom_fields(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(ProjectCustomField)
            .where(ProjectCustomField.project_id == project.id)
            .order_by(ProjectCustomField.sort_order, ProjectCustomField.name)
        )
    ).scalars()
    return list(rows.all())


@router.post(
    f"{_P}/custom-fields/",
    response_model=CustomFieldOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_custom_field(
    payload: CreateCustomFieldPayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
):
    _validate_custom_field_options(payload.field_type, payload.options)
    name = payload.name.strip()
    dup = await db.execute(
        select(ProjectCustomField).where(
            ProjectCustomField.project_id == project.id, ProjectCustomField.name == name
        )
    )
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Custom field name already in use")
    field = ProjectCustomField(
        project_id=project.id,
        name=name,
        field_type=payload.field_type,
        options=payload.options,
        sort_order=payload.sort_order,
    )
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return field


@router.patch(f"{_P}/custom-fields/{{field_id}}/", response_model=CustomFieldOut)
async def update_custom_field(
    field_id: str,
    payload: UpdateCustomFieldPayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
):
    field = await db.get(ProjectCustomField, field_id)
    if field is None or field.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Custom field not found")

    changes = payload.model_dump(exclude_unset=True)
    if "field_type" in changes:
        if changes["field_type"] != field.field_type.value:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "field_type is immutable")
        del changes["field_type"]

    if "name" in changes:
        name = changes["name"].strip()
        dup = await db.execute(
            select(ProjectCustomField).where(
                ProjectCustomField.project_id == project.id,
                ProjectCustomField.name == name,
                ProjectCustomField.id != field_id,
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Custom field name already in use")
        changes["name"] = name

    new_options = changes["options"] if "options" in changes else field.options
    _validate_custom_field_options(field.field_type, new_options)

    for key, value in changes.items():
        setattr(field, key, value)
    await db.commit()
    await db.refresh(field)
    return field


@router.delete(f"{_P}/custom-fields/{{field_id}}/")
async def delete_custom_field(
    field_id: str,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    field = await db.get(ProjectCustomField, field_id)
    if field is None or field.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Custom field not found")
    await db.delete(field)
    await db.commit()
    return _OK


# ---- Automations -----------------------------------------------------------
@router.get(f"{_P}/automations/", response_model=list[ProjectAutomationOut])
async def list_automations(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(ProjectAutomation)
            .where(ProjectAutomation.project_id == project.id)
            .order_by(ProjectAutomation.created_at)
        )
    ).scalars()
    return list(rows.all())


@router.post(
    f"{_P}/automations/",
    response_model=ProjectAutomationOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_automation(
    payload: CreateProjectAutomationPayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
):
    auto = ProjectAutomation(
        project_id=project.id,
        name=payload.name.strip(),
        trigger=payload.trigger.strip(),
        action=payload.action.strip(),
        enabled=True,
    )
    db.add(auto)
    await db.commit()
    await db.refresh(auto)
    return auto


@router.delete(f"{_P}/automations/{{automation_id}}/")
async def delete_automation(
    automation_id: str,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    auto = await db.get(ProjectAutomation, automation_id)
    if auto is None or auto.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Automation not found")
    await db.delete(auto)
    await db.commit()
    return _OK


# ---- States ----------------------------------------------------------------
@router.get(f"{_P}/states/", response_model=list[ProjectStateOut])
async def list_states(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(ProjectState)
            .where(ProjectState.project_id == project.id)
            .order_by(ProjectState.sort_order)
        )
    ).scalars()
    return list(rows.all())


@router.post(
    f"{_P}/states/", response_model=ProjectStateOut, status_code=status.HTTP_201_CREATED
)
async def create_state(
    payload: CreateProjectStatePayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
):
    next_order = (
        await db.execute(
            select(func.coalesce(func.max(ProjectState.sort_order), -1)).where(
                ProjectState.project_id == project.id
            )
        )
    ).scalar_one() + 1
    state = ProjectState(
        project_id=project.id,
        name=payload.name.strip(),
        color=payload.color,
        group=payload.group,
        sort_order=next_order,
    )
    db.add(state)
    await db.commit()
    await db.refresh(state)
    return state


@router.delete(f"{_P}/states/{{state_id}}/")
async def delete_state(
    state_id: str,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool]:
    state = await db.get(ProjectState, state_id)
    if state is None or state.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "State not found")
    await db.delete(state)
    await db.commit()
    return _OK


# ---- Features (toggle only) ------------------------------------------------
@router.get(f"{_P}/features/", response_model=list[ProjectFeatureOut])
async def list_features(
    project: Project = Depends(get_project_or_404), db: AsyncSession = Depends(get_db)
):
    rows = (
        await db.execute(
            select(ProjectFeature)
            .where(ProjectFeature.project_id == project.id)
            .order_by(_FEATURE_ORDER)
        )
    ).scalars()
    return list(rows.all())


@router.patch(f"{_P}/features/{{feature_id}}/", response_model=ProjectFeatureOut)
async def update_feature(
    feature_id: str,
    payload: UpdateFeaturePayload,
    project: Project = Depends(require_project_permission(EProjectPermission.MANAGE_SETTINGS)),
    db: AsyncSession = Depends(get_db),
):
    feature = await db.get(ProjectFeature, feature_id)
    if feature is None or feature.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feature not found")
    feature.enabled = payload.enabled
    await db.commit()
    await db.refresh(feature)
    return feature
