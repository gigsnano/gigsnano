from pydantic import BaseModel


class ProjectResultOut(BaseModel):
    """Compact row for a project search hit."""

    id: str
    name: str
    identifier: str


class WorkItemResultOut(BaseModel):
    """Compact row for a work-item (Story) search hit."""

    id: str
    project_id: str
    title: str
    story_number: int | None


class CycleResultOut(BaseModel):
    id: str
    project_id: str
    name: str


class ModuleResultOut(BaseModel):
    id: str
    project_id: str
    name: str


class ViewResultOut(BaseModel):
    id: str
    project_id: str
    name: str


class PageResultOut(BaseModel):
    id: str
    project_id: str
    title: str


class SearchResultsOut(BaseModel):
    """GET /workspaces/{slug}/search/ response — grouped, access-scoped hits."""

    projects: list[ProjectResultOut]
    work_items: list[WorkItemResultOut]
    cycles: list[CycleResultOut]
    modules: list[ModuleResultOut]
    views: list[ViewResultOut]
    pages: list[PageResultOut]
