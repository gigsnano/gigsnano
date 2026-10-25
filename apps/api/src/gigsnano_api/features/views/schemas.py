from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field

from gigsnano_api.features.views.filter_query import validate_filter_query
from gigsnano_api.models import EViewLayout, EViewShareScope

# Applied to every inbound filter_query, so a new create/update path can't
# reintroduce the unvalidated-free-text hole (GIN-175). A bad query is a 422,
# not a view that silently shows everything.
FilterQuery = Annotated[str, BeforeValidator(validate_filter_query)]


class ProjectViewOut(BaseModel):
    id: str
    workspace_slug: str
    project_id: str
    name: str
    description: str
    layout: EViewLayout
    filter_query: str
    owner_id: str
    owner_name: str
    share_scope: EViewShareScope
    is_favorite: bool
    created_at: datetime
    updated_at: datetime


class CreateProjectViewPayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    layout: EViewLayout
    filter_query: FilterQuery = ""
    share_scope: EViewShareScope = EViewShareScope.PRIVATE


class UpdateProjectViewPayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    layout: EViewLayout | None = None
    filter_query: FilterQuery | None = None
    share_scope: EViewShareScope | None = None


class WorkspaceViewOut(BaseModel):
    id: str
    workspace_slug: str
    name: str
    description: str
    layout: EViewLayout
    filter_query: str
    owner_id: str
    owner_name: str
    share_scope: EViewShareScope
    is_favorite: bool
    created_at: datetime
    updated_at: datetime


class CreateWorkspaceViewPayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    layout: EViewLayout = EViewLayout.LIST
    filter_query: FilterQuery = ""
    share_scope: EViewShareScope = EViewShareScope.PRIVATE
