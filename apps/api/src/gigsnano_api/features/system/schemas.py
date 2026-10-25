"""Pydantic contracts for the multi-repository System Bundle API (GIN-410/412).

Field names match the frontend types (`IProjectRepository`, `ISystemBundle`, …)
verbatim — snake_case, enums by value.
"""

import enum
from datetime import datetime

from pydantic import BaseModel, Field

from gigsnano_api.models.projects import ECloneStatus, EIndexStatus
from gigsnano_api.models.system import (
    EBundleStatus,
    ECiState,
    ECodeScopeStatus,
    EMergeState,
    ERepoAccess,
    ERepoScopeMode,
    ERepositoryType,
    EReviewState,
    ESyncStatus,
)


class ERepoHealth(str, enum.Enum):
    READY = "ready"
    BEHIND = "behind"
    SYNCING = "syncing"
    ERROR = "error"


class EDependencyType(str, enum.Enum):
    BUILD_ORDER = "build_order"
    RUNTIME = "runtime"
    BLOCKING = "blocking"


# ---- Repositories ----------------------------------------------------------


class RepositoryOut(BaseModel):
    id: str
    project_id: str
    provider: str
    external_repository_id: str
    full_name: str
    display_name: str
    repository_type: ERepositoryType
    default_branch: str
    is_primary: bool
    default_access: ERepoAccess
    health: ERepoHealth
    clone_status: ECloneStatus
    sync_status: ESyncStatus
    index_status: EIndexStatus
    indexed_commit_sha: str | None
    indexed_at: datetime | None
    bundle_ids: list[str]
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ConnectRepositoryInput(BaseModel):
    external_repository_id: str
    full_name: str
    default_branch: str = "main"
    repository_type: ERepositoryType | None = None
    default_access: ERepoAccess | None = None


class BulkConnectPayload(BaseModel):
    repositories: list[ConnectRepositoryInput] = Field(default_factory=list)


class ConnectResult(BaseModel):
    full_name: str
    ok: bool
    repository: RepositoryOut | None = None
    error: str | None = None


class UpdateRepositoryPayload(BaseModel):
    display_name: str | None = None
    repository_type: ERepositoryType | None = None
    default_access: ERepoAccess | None = None
    default_branch: str | None = None
    is_primary: bool | None = None


# ---- Bundles ---------------------------------------------------------------


class BundleRepoConfig(BaseModel):
    project_repository_id: str
    repository_type: ERepositoryType
    branch: str = "main"
    source_path: str = ""
    mount_path: str = ""
    access: ERepoAccess = ERepoAccess.REFERENCE
    required: bool = False
    build_command: str = ""
    test_command: str = ""
    execution_order: int = 0


class BundleDependency(BaseModel):
    from_project_repository_id: str
    to_project_repository_id: str
    dependency_type: EDependencyType = EDependencyType.BUILD_ORDER
    notes: str = ""


class ValidationIssue(BaseModel):
    code: str
    message: str
    repo_ids: list[str]


class ValidationResult(BaseModel):
    valid: bool
    issues: list[ValidationIssue]


class BundleVersionOut(BaseModel):
    id: str
    bundle_id: str
    version: int
    repositories: list[BundleRepoConfig]
    dependencies: list[BundleDependency]
    validation_result: ValidationResult
    created_at: datetime


class BundleOut(BaseModel):
    id: str
    project_id: str
    name: str
    description: str
    status: EBundleStatus
    is_default: bool
    current_version: int
    repository_count: int
    write_count: int
    reference_count: int
    affected_work_item_count: int
    updated_at: datetime
    created_at: datetime
    latest: BundleVersionOut


class CreateBundlePayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    repositories: list[BundleRepoConfig] = Field(default_factory=list)
    dependencies: list[BundleDependency] = Field(default_factory=list)
    save_as_draft: bool = False


class UpdateBundlePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    repositories: list[BundleRepoConfig] | None = None
    dependencies: list[BundleDependency] | None = None
    save_as_draft: bool = False


class ValidateBundlePayload(BaseModel):
    repositories: list[BundleRepoConfig] = Field(default_factory=list)
    dependencies: list[BundleDependency] = Field(default_factory=list)


# ---- Work-item Code scope (GIN-413) ----------------------------------------


class RepoScopeIn(BaseModel):
    project_repository_id: str
    mode: ERepoScopeMode = ERepoScopeMode.REFERENCE
    required_delivery: bool = False
    base_branch: str = "main"
    reason: str = ""


class RepoScopeOut(RepoScopeIn):
    display_name: str = ""


class SaveCodeScopePayload(BaseModel):
    bundle_version_id: str | None = None
    branch_pattern: str | None = None
    reason: str | None = None
    repositories: list[RepoScopeIn] = Field(default_factory=list)


class CodeScopeOut(BaseModel):
    id: str | None
    work_item_id: str
    bundle_id: str | None
    bundle_version_id: str | None
    bundle_version: int | None
    status: ECodeScopeStatus
    branch_pattern: str
    reason: str
    confirmed_by: str | None
    confirmed_at: datetime | None
    repositories: list[RepoScopeOut]
    has_default_bundle: bool
    created_at: datetime | None
    updated_at: datetime | None


class EffectiveScopeOut(BaseModel):
    """Resolved execution scope for an agent run — the confirmed, pinned plan."""

    work_item_id: str
    bundle_version_id: str | None
    branch_pattern: str
    write: list[str]
    reference: list[str]
    excluded: list[str]
    confirmed_at: datetime | None


# ---- Delivery Bundle (GIN-414) ---------------------------------------------


class DeliveryRepoOut(BaseModel):
    project_repository_id: str
    display_name: str
    base_branch: str
    head_branch: str
    commit_count: int
    pr_url: str
    pr_id: str
    required: bool
    ci_state: ECiState
    review_state: EReviewState
    merge_order: int
    merge_state: EMergeState
    no_change: bool
    change_summary: str
    deployment_impact: str


class DeliveryOut(BaseModel):
    id: str
    work_item_id: str
    branch_name: str
    overall_state: str
    cancelled: bool
    rollback_required: bool
    repositories: list[DeliveryRepoOut]
    blocking_repo_ids: list[str]
    created_at: datetime
    updated_at: datetime


class UpdateDeliveryRepoPayload(BaseModel):
    head_branch: str | None = None
    commit_count: int | None = None
    pr_url: str | None = None
    pr_id: str | None = None
    required: bool | None = None
    ci_state: ECiState | None = None
    review_state: EReviewState | None = None
    merge_order: int | None = None
    merge_state: EMergeState | None = None
    no_change: bool | None = None
    change_summary: str | None = None
    deployment_impact: str | None = None


# ---- Scoped execution plan + Source Snapshot (GIN-415) ---------------------


class ExecPlanRepoOut(BaseModel):
    project_repository_id: str
    display_name: str
    mode: ERepoScopeMode
    base_branch: str
    mount_path: str
    commit_sha: str | None
    clone_ready: bool
    index_ready: bool
    available: bool


class ExecutionPlanOut(BaseModel):
    work_item_id: str
    bundle_version_id: str | None
    branch_pattern: str
    stale: bool
    can_start: bool
    repositories: list[ExecPlanRepoOut]
    write_ids: list[str]
    reference_ids: list[str]
    excluded_ids: list[str]
    warnings: list[str]


class SourceSnapshotOut(BaseModel):
    id: str
    project_id: str
    work_item_id: str | None
    bundle_version_id: str | None
    agent_run_id: str | None
    deployment_run_id: str | None
    repository_commits: dict
    created_at: datetime


# ---- Audit + health (GIN-416) ----------------------------------------------


class AuditEventOut(BaseModel):
    id: str
    actor_user_id: str | None
    action: str
    object_type: str
    object_id: str | None
    before_summary: str
    after_summary: str
    reason: str
    correlation_id: str | None
    created_at: datetime


class RepoHealthOut(BaseModel):
    project_repository_id: str
    display_name: str
    rollup: str


class BundleHealthOut(BaseModel):
    bundle_id: str
    name: str
    rollup: str


class ProjectHealthOut(BaseModel):
    repositories: list[RepoHealthOut]
    bundles: list[BundleHealthOut]
