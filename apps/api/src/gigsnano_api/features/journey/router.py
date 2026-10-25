from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.core.db import get_db
from gigsnano_api.models import Project
from gigsnano_api.shared.context import get_project_or_404, require_project_write_access

from .contracts import get_contract, put_contract
from .delivery import get_delivery_plan, start_delivery
from .discovery import project_fresh_discovery
from .schemas import DeliveryPlanOut, JourneyOut, StartDeliveryPayload
from .service import get_journey

router = APIRouter(tags=["journey"])

# Surface → (doc_type, owning bmad workflow). The contract is persisted as the
# owning step's Artifact.structured_json under this doc_type.
_CONTRACTS = {
    "experience": ("experience_contract", "bmad-ux"),
    "topology": ("solution_topology", "bmad-create-architecture"),
    "discovery": ("discovery_baseline", "bmad-document-project"),
}


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/journey/",
    response_model=JourneyOut,
)
async def project_journey(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await get_journey(db, project)


@router.get(
    "/workspaces/{workspace_slug}/projects/{project_id}/journey/delivery/",
    response_model=DeliveryPlanOut,
)
async def delivery_plan(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
):
    return await get_delivery_plan(db, project)


@router.post("/workspaces/{workspace_slug}/projects/{project_id}/journey/delivery/start/")
async def start_delivery_route(
    payload: StartDeliveryPayload,
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    cycle_id, created = await start_delivery(db, project, payload.title, payload.story_ids)
    return {"cycle_id": cycle_id, "created": created}


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/journey/experience/")
async def get_experience(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"contract": await get_contract(db, project, _CONTRACTS["experience"][0])}


@router.put("/workspaces/{workspace_slug}/projects/{project_id}/journey/experience/")
async def put_experience(
    contract: dict = Body(...),
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc_type, workflow = _CONTRACTS["experience"]
    return {"contract": await put_contract(db, project, doc_type, workflow, contract)}


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/journey/topology/")
async def get_topology(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"contract": await get_contract(db, project, _CONTRACTS["topology"][0])}


@router.put("/workspaces/{workspace_slug}/projects/{project_id}/journey/topology/")
async def put_topology(
    contract: dict = Body(...),
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc_type, workflow = _CONTRACTS["topology"]
    return {"contract": await put_contract(db, project, doc_type, workflow, contract)}


@router.get("/workspaces/{workspace_slug}/projects/{project_id}/journey/discovery/")
async def get_discovery_baseline(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Saved baseline if approved, else a fresh projection to confirm.
    saved = await get_contract(db, project, _CONTRACTS["discovery"][0])
    if saved is not None:
        return {"discovery": saved, "saved": True}
    fresh = await project_fresh_discovery(db, project)
    return {"discovery": fresh.model_dump(), "saved": False}


@router.put("/workspaces/{workspace_slug}/projects/{project_id}/journey/discovery/")
async def put_discovery_baseline(
    contract: dict = Body(...),
    project: Project = Depends(require_project_write_access),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc_type, workflow = _CONTRACTS["discovery"]
    return {"discovery": await put_contract(db, project, doc_type, workflow, contract), "saved": True}
