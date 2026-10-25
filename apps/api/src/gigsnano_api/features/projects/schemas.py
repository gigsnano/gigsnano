from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from gigsnano_api.features.members.schemas import MemberPreviewOut
from gigsnano_api.models import ECustomFieldType, EPlanningMethod, EProjectFlow, EStateGroup


class CreateProjectPayload(BaseModel):
    """Frontend ICreateProjectPayload."""

    name: str = Field(min_length=1, max_length=120)
    identifier: str = Field(min_length=1, max_length=10)
    description: str = ""
    flow: EProjectFlow
    has_ui: bool = True
    cover_image_url: str
    logo_emoji: str | None = None
    logo_color: str | None = None
    logo_image_url: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    repo_full_name: str | None = None
    # Apply a project template (GIN-239): seeds the Foundation on top of the defaults.
    template_id: str | None = None
    # Blank project: create only the container — no Sprint-0 cycle or work items.
    blank: bool = False


class UpdateProjectPayload(BaseModel):
    """Frontend IUpdateProjectPayload (src/types/project-settings.ts)."""

    name: str | None = None
    description: str | None = None
    overview: str | None = None
    identifier: str | None = None
    has_ui: bool | None = None
    start_date: date | None = None
    target_date: date | None = None
    # Reassigning the lead (GIN-487): must be an active member of this project.
    lead_id: str | None = None
    cover_image_url: str | None = None
    logo_emoji: str | None = None
    logo_color: str | None = None
    logo_image_url: str | None = None
    planning_method: EPlanningMethod | None = None


class TransferProjectPayload(BaseModel):
    """Request a project transfer to another workspace (frontend ITransferProjectPayload)."""

    destination_workspace_slug: str = Field(min_length=1, max_length=48)


class TransferRequestOut(BaseModel):
    """A pending/resolved GitHub-style project transfer request (GIN-85)."""

    id: str
    project_id: str
    project_name: str
    project_identifier: str
    source_workspace_slug: str
    source_workspace_name: str
    dest_workspace_slug: str
    dest_workspace_name: str
    invited_email: str
    status: str
    created_at: datetime


class ProjectOut(BaseModel):
    """Frontend IProject."""

    id: str
    workspace_slug: str
    name: str
    identifier: str
    cover_image_url: str
    logo_emoji: str | None
    logo_color: str | None
    logo_image_url: str | None
    start_date: date
    target_date: date
    description: str
    overview: str
    lead_id: str | None
    member_count: int
    members: list[MemberPreviewOut]
    flow: EProjectFlow
    has_ui: bool
    # Planning/estimation method + when it last changed (GIN-330). Every work-item
    # view reads this one value so the effective method is consistent.
    planning_method: str = "automatic"
    planning_method_updated_at: datetime | None = None
    sprint_zero_status: str
    sprint_zero_progress: int
    repo_full_name: str | None = None
    # Already stored at clone time; exposed so the Codebase header can show the real
    # branch instead of a hardcoded "develop" (GIN-158).
    repo_default_branch: str | None = None
    clone_status: str = "none"
    clone_error: str | None = None
    index_status: str = "none"
    index_error: str | None = None
    indexed_commit_sha: str | None = None
    indexed_at: datetime | None = None
    # Solution foundation (GIN-445): always populated in API responses. Legacy null
    # rows dual-read as Software Delivery v1 via serialize_project.
    solution_key: str = "software_delivery"
    solution_version: int = 1
    created_at: datetime
    updated_at: datetime


class ProjectLabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    color: str
    created_at: datetime


class CreateProjectLabelPayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(min_length=1, max_length=20)


class ProjectStateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    color: str
    group: EStateGroup
    order: int = Field(validation_alias="sort_order", serialization_alias="order")


class CreateProjectStatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(min_length=1, max_length=20)
    group: EStateGroup


class ProjectFeatureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    key: str
    name: str
    description: str
    enabled: bool


class UpdateFeaturePayload(BaseModel):
    enabled: bool


class ProjectEstimateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    type: str
    description: str
    created_at: datetime


class CreateProjectEstimatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: Literal["points", "hours", "days"]
    description: str = ""


class CustomFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    field_type: str
    options: list[str] | None
    sort_order: float
    created_at: datetime


class CreateCustomFieldPayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    field_type: ECustomFieldType
    options: list[str] | None = None
    sort_order: float = 0.0


class UpdateCustomFieldPayload(BaseModel):
    name: str | None = None
    options: list[str] | None = None
    sort_order: float | None = None
    field_type: str | None = None  # only to detect+reject changes (400)


class ProjectAutomationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    trigger: str
    action: str
    enabled: bool
    created_at: datetime


class CreateProjectAutomationPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    trigger: str = Field(min_length=1, max_length=200)
    action: str = Field(min_length=1, max_length=200)
