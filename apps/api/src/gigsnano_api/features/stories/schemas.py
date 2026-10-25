import enum
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from gigsnano_api.models import (
    EProjectActivityType,
    EReadinessResult,
    EStoryPriority,
    EStoryStatus,
    EStoryType,
)


class LegacyLabelMixin(BaseModel):
    """Accepts the pre-GIN-475 singular `label_id` on write and folds it into
    `label_ids`, so older clients, saved automations, and stored templates keep
    working. `label_ids` always wins when both are sent.

    Kept deliberately at the API edge: below this line labels are a list, full
    stop. Remove once no client sends `label_id` (and drop it from `StoryOut`).
    """

    label_ids: list[str] | None = None
    label_id: str | None = None  # deprecated — use label_ids

    @model_validator(mode="after")
    def _fold_legacy_label(self):
        # `model_fields_set`, not `is not None`: an explicit `label_id: null` means
        # "clear the labels", while omitting it means "leave them alone".
        if self.label_ids is None and "label_id" in self.model_fields_set:
            self.label_ids = [self.label_id] if self.label_id else []
            self.model_fields_set.add("label_ids")  # survives model_dump(exclude_unset=True)
        return self


class EDeleteCascade(str, enum.Enum):
    """How a delete treats the item's children (GIN-97).

    DETACH — children stay live, their parent_id is nulled (the historical
    hard-delete behaviour). CHILDREN — the whole subtree is soft-deleted together.
    """

    DETACH = "detach"
    CHILDREN = "children"


class CreateStoryPayload(LegacyLabelMixin):
    """Frontend ICreateStoryPayload."""

    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    # Explicit, never sniffed (GIN-300 / ADR 0001). Absent means "html", which is
    # what the TipTap editor sends; agents and MCP pass "markdown".
    content_format: str | None = None
    cycle_id: str | None = None
    module_id: str | None = None
    status: EStoryStatus = EStoryStatus.TODO
    parent_id: str | None = None
    priority: EStoryPriority = EStoryPriority.NONE
    type: EStoryType = EStoryType.STORY
    assignee_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    estimate_id: str | None = None
    estimate_points: int | None = None
    size: str | None = None
    duration_minutes: int | None = None


class UpdateStoryPayload(LegacyLabelMixin):
    """Frontend IUpdateStoryPayload."""

    title: str | None = None
    description: str | None = None
    content_format: str | None = None
    status: EStoryStatus | None = None
    priority: EStoryPriority | None = None
    type: EStoryType | None = None
    start_date: date | None = None
    target_date: date | None = None
    # Backdating for imported/migrated work (GIN-527). Every date-windowed view
    # -- the activity chart, analytics, the digests -- reads created_at, so an
    # import that lands everything on the day it ran reports a spike that never
    # happened. The change is logged to story history like any other field.
    created_at: datetime | None = None
    skipped: bool | None = None
    readiness_result: EReadinessResult | None = None
    assignee_id: str | None = None
    ai_agent_id: str | None = None
    estimate_id: str | None = None
    estimate_points: int | None = None
    size: str | None = None
    duration_minutes: int | None = None
    parent_id: str | None = None
    cycle_id: str | None = None
    module_id: str | None = None
    order: float | None = None
    custom_fields: dict[str, object] | None = None


class UpdatePreviewOut(BaseModel):
    """dry_run result for a work-item update (GIN-368): validation + the fields that
    would change, computed without committing any business mutation."""

    dry_run: bool = True
    valid: bool = True
    changed_fields: list[str]
    proposed: dict[str, object]
    current_updated_at: datetime
    workspace_slug: str
    project_id: str
    story_id: str


class CloneCopyOptions(BaseModel):
    """What a duplicate copies vs resets (GIN-355/357). Defaults follow the policy:
    content/planning metadata copy; people, schedule, history and high-risk data
    reset unless explicitly enabled."""

    description: bool = True
    priority: bool = True
    labels: bool = True
    estimate: bool = True
    module: bool = True
    custom_fields: bool = True
    parent: bool = True
    assignee: bool = False
    cycle: bool = False
    dates: bool = False
    date_mode: str = "exact"  # "exact" | "shift"
    new_start_date: date | None = None
    relations: bool = False  # external relations
    include_children: bool = False
    child_depth: int | None = None  # None = all descendants, 1 = direct children
    max_items: int = Field(default=100, ge=1, le=500)


class CloneRootOverrides(BaseModel):
    """Edited values for the new root item (the duplicate-and-edit form). Only the
    root takes overrides; descendants copy per policy."""

    title: str | None = None
    description: str | None = None
    content_format: str | None = None
    type: EStoryType | None = None
    priority: EStoryPriority | None = None
    estimate_id: str | None = None
    estimate_points: int | None = None
    module_id: str | None = None
    assignee_id: str | None = None
    start_date: date | None = None
    target_date: date | None = None
    custom_fields: dict[str, object] | None = None


class CloneStoryRequest(BaseModel):
    # The destination project is the URL's project_id; the source may live in
    # another project the caller can read.
    source_id: str
    options: CloneCopyOptions = Field(default_factory=CloneCopyOptions)
    overrides: CloneRootOverrides = Field(default_factory=CloneRootOverrides)


class CloneItemOut(BaseModel):
    source_id: str
    id: str
    code: str | None
    title: str


class CloneResultOut(BaseModel):
    source_id: str
    root_id: str
    root_code: str | None
    created: list[CloneItemOut]
    copied_fields: list[str]
    reset_fields: list[str]
    warnings: list[str]


class ClonePreviewOut(BaseModel):
    source_id: str
    source_code: str | None
    prefill: dict[str, object]
    copyable_fields: list[str]
    reset_fields: list[str]
    child_count: int


class StoryBmadOut(BaseModel):
    """Frontend IStoryBmad."""

    workflow: str
    agent: str
    artifact: str
    is_locked: bool
    is_required: bool
    skipped: bool
    readiness_result: EReadinessResult | None


class StoryOut(BaseModel):
    """Frontend IStory. `order` is the Story.sort_order column."""

    id: str
    story_number: int | None
    code: str | None
    workspace_slug: str
    project_id: str
    # The item this was duplicated from, if any (GIN-355). Enables a link back to source.
    cloned_from_id: str | None = None
    cycle_id: str | None
    module_id: str | None
    parent_id: str | None
    title: str
    description: str
    # What `description` actually holds (GIN-304). Agents no longer have to guess:
    # "markdown" when a canonical copy existed and the caller asked for it,
    # "html" otherwise. Always present, so absence is never ambiguous.
    content_format: str = "html"
    status: EStoryStatus
    priority: EStoryPriority
    type: EStoryType
    start_date: date | None
    target_date: date | None
    order: float
    assignee_id: str | None
    ai_agent_id: str | None
    label_ids: list[str]
    # Deprecated (GIN-475): the first label, so readers not yet migrated to
    # `label_ids` keep rendering something sensible. Never write through it.
    label_id: str | None
    estimate_id: str | None
    estimate_points: int | None
    size: str | None
    duration_minutes: int | None
    sub_issue_count: int
    bmad: StoryBmadOut | None
    custom_fields: dict[str, object] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class AssignedStoryOut(StoryOut):
    """Frontend IAssignedStory."""

    project_name: str
    project_identifier: str


class TrashedStoryOut(AssignedStoryOut):
    """A soft-deleted work item as shown in the workspace trash (GIN-97)."""

    deleted_at: datetime
    deleted_by_id: str | None


class ActivityOut(BaseModel):
    """Frontend IProjectActivity."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    type: EProjectActivityType
    actor_name: str
    actor_avatar_url: str | None
    action: str
    created_at: datetime


class ImpactRelatedItemOut(BaseModel):
    id: str
    code: str
    title: str
    status: EStoryStatus
    priority: EStoryPriority
    reason: str


class ImpactRiskOut(BaseModel):
    level: str
    score: int
    rationale: str


class ImpactCitationOut(BaseModel):
    type: str
    ref: str


class ImpactOut(BaseModel):
    story_code: str
    affected_files: list[str]
    related_items: list[ImpactRelatedItemOut]
    risk: ImpactRiskOut
    citations: list[ImpactCitationOut]


class EstimateOut(BaseModel):
    story_code: str
    points: int
    rationale: str


class SuggestedDependencyOut(BaseModel):
    code: str
    title: str
    relation: str
    confidence: str
    evidence: str
