from datetime import date

from pydantic import BaseModel


class ProjectProgressOut(BaseModel):
    project_id: str
    project_name: str
    identifier: str
    progress_pct: int


class VelocityOut(BaseModel):
    cycle_name: str
    project_name: str
    completed: int
    committed: int


class ActiveCycleDetailOut(BaseModel):
    cycle_id: str
    cycle_name: str
    project_id: str
    project_name: str
    story_count: int
    completed_story_count: int
    end_date: date | None


class WorkspaceAnalyticsOut(BaseModel):
    workspace_slug: str
    active_projects: int
    total_projects: int
    active_cycles: int
    completed_stories: int
    total_stories: int
    sprint_zero_complete: int
    members_active: int
    project_progress: list[ProjectProgressOut]
    velocity: list[VelocityOut]
    active_cycle_details: list[ActiveCycleDetailOut]
