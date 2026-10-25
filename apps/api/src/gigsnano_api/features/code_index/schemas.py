from datetime import datetime

from pydantic import BaseModel


class IndexStatusOut(BaseModel):
    project_id: str
    index_status: str
    index_error: str | None = None
    indexed_commit_sha: str | None = None


# ---- Codebase Overview contract (GIN-272) ----------------------------------
# Every section extends Provenance so the UI can render freshness + an honest
# unavailable/stale/indexing state per group instead of a fabricated value.

SectionState = str  # available | stale | partial | indexing | unavailable


class Provenance(BaseModel):
    state: SectionState
    source: str
    built_at: datetime | None = None
    detail: str | None = None


class IndexInfo(BaseModel):
    status: str  # none | pending | indexing | ready | failed
    repo_full_name: str | None = None
    branch: str | None = None
    indexed_commit_sha: str | None = None
    indexed_at: datetime | None = None
    head_commit_sha: str | None = None
    drifted: bool = False
    error: str | None = None


class CountsSection(Provenance):
    files: int = 0
    loc: int | None = None
    symbols: int = 0
    edges: int = 0
    languages: int = 0
    languages_source: str | None = None


class HealthDimension(BaseModel):
    key: str  # architecture | maintainability | test_coverage | security
    label: str
    status: str  # healthy | warning | critical | unavailable
    score: int | None = None
    evidence: str
    drilldown: str | None = None  # target view id


class HealthSection(Provenance):
    score: int | None = None
    measured_dimensions: int = 0
    dimensions: list[HealthDimension] = []


class ModuleItem(BaseModel):
    key: str
    name: str
    files: int
    symbols: int


class ModulesSection(Provenance):
    items: list[ModuleItem] = []


class RiskItem(BaseModel):
    id: str
    severity: str  # critical | high | medium | low
    category: str  # security | hotspot
    title: str
    evidence: str
    location: str | None = None
    analyzer: str
    detected_at: datetime | None = None


class RisksSection(Provenance):
    items: list[RiskItem] = []


class ChangeItem(BaseModel):
    sha: str
    short_sha: str
    author: str
    message: str
    committed_at: datetime | None = None
    is_indexed_head: bool = False


class ChangesSection(Provenance):
    items: list[ChangeItem] = []


class CodebaseOverviewOut(BaseModel):
    state: str  # ready | stale | indexing | failed | empty | none
    index: IndexInfo
    counts: CountsSection
    health: HealthSection
    modules: ModulesSection
    risks: RisksSection
    changes: ChangesSection
