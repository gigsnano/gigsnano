from pydantic import BaseModel, Field


class PackageFileIn(BaseModel):
    file_name: str = Field(min_length=1, max_length=300)
    mime_type: str = Field(default="", max_length=120)
    content: str = ""


class CreatePackagePayload(BaseModel):
    name: str = Field(default="", max_length=200)
    files: list[PackageFileIn] = Field(min_length=1)


class PackageDocumentOut(BaseModel):
    id: str
    title: str
    file_name: str | None
    mime_type: str | None
    original_path: str | None
    parse_state: str | None
    parse_error: str | None
    byte_size: int | None
    checksum: str | None
    canonical: bool


class PackageCounts(BaseModel):
    total: int
    ready: int
    needs_attention: int


class PackageOut(BaseModel):
    id: str
    project_id: str
    name: str
    status: str
    correlation_id: str
    counts: PackageCounts
    documents: list[PackageDocumentOut]


class FindingOut(BaseModel):
    id: str
    document_id: str | None
    kind: str
    status: str
    title: str
    detail: str
    confidence: float
    anchor: str
    anchor_start: int | None
    anchor_end: int | None
    source_excerpt: str
    override: dict | None


class AnalysisOut(BaseModel):
    package_id: str
    status: str
    counts_by_status: dict[str, int]
    counts_by_kind: dict[str, int]
    findings: list[FindingOut]


class UpdateDocumentPayload(BaseModel):
    """A user correction. `doc_type` re-classifies; `canonical` marks a
    source-of-truth document."""

    doc_type: str | None = None
    canonical: bool | None = None


class UpdateFindingPayload(BaseModel):
    """Records an override without deleting the AI's original proposal."""

    status: str | None = None
    title: str | None = Field(default=None, max_length=300)
    detail: str | None = None


class BuildPlanPayload(BaseModel):
    """`strategy` is preserve | convert | hybrid."""

    strategy: str = "convert"


class ImportChangeOut(BaseModel):
    id: str
    op: str
    target: str
    status: str
    temp_key: str
    parent_temp_key: str | None
    title: str
    payload: dict | None
    finding_id: str | None
    reason: str
    confidence: float


class ConflictOut(BaseModel):
    finding_id: str
    title: str
    anchor: str
    resolution: str


class ImportPlanOut(BaseModel):
    id: str
    package_id: str
    strategy: str
    status: str
    correlation_id: str
    counts_by_target: dict[str, int]
    counts_by_status: dict[str, int]
    blocking_conflicts: list[ConflictOut]
    can_apply: bool
    changes: list[ImportChangeOut]


class DecideChangesPayload(BaseModel):
    """Bulk approve/exclude. Omit `change_ids` to act on every change."""

    decision: str  # approved | excluded | proposed
    change_ids: list[str] | None = None


class WorkItemSourceOut(BaseModel):
    """One "Derived from: <document>, <section>" line."""

    document_id: str | None
    package_id: str | None
    document_name: str
    document_version: int | None
    anchor: str
    anchor_start: int | None
    anchor_end: int | None
    finding_id: str | None


class GeneratedWorkItemOut(BaseModel):
    story_id: str
    story_number: int | None
    title: str
    anchor: str
