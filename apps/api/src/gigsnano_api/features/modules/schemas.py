from datetime import date, datetime

from pydantic import BaseModel, Field

from gigsnano_api.models import EModuleStatus


class CreateModulePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    status: EModuleStatus | None = None
    lead_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    color: str | None = Field(default=None, max_length=9)


class UpdateModulePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    status: EModuleStatus | None = None
    lead_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    color: str | None = Field(default=None, max_length=9)


class BulkModuleAssignPayload(BaseModel):
    """Assign/remove many work items in one request (GIN-380). `module_id=None`
    removes the assignment; codes are project-local (e.g. 'MBA-12')."""

    codes: list[str] = Field(min_length=1, max_length=500)
    module_id: str | None = None
    dry_run: bool = False


class ModuleOut(BaseModel):
    """Frontend IModule."""

    id: str
    workspace_slug: str
    project_id: str
    name: str
    description: str
    status: EModuleStatus
    lead_id: str | None
    start_date: date | None
    target_date: date | None
    color: str | None
    story_count: int
    completed_story_count: int
    created_at: datetime
    updated_at: datetime
