"""Project Journey read contract (GIN-434 Phase 0).

Serializes to the frontend's IJourney/IJourneyStep (src/types/journey/journey.ts)
so the FE swaps its mock (mocks/data/journey.ts) for this endpoint with no
hook/component change. Read-only projection over Sprint-0 Story.bmad_* state —
no journey table (see 2026-07-24-journey-phase0-contracts-design.md).
"""

import enum

from pydantic import BaseModel


class EJourneyPhase(str, enum.Enum):
    DEFINE = "define"
    EXPERIENCE = "experience"
    ENGINEER = "engineer"
    PLAN = "plan"
    DELIVER = "deliver"


class EStepState(str, enum.Enum):
    # Journey-execution state — SEPARATE from EStoryStatus. A manual status flip
    # can never yield VERIFIED; that comes only from a finalized artifact.
    NOT_STARTED = "not_started"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    REVIEW_REQUIRED = "review_required"
    BLOCKED = "blocked"
    VERIFIED = "verified"
    SKIPPED = "skipped"


class JourneyStepOutput(BaseModel):
    label: str
    type: str
    version: int
    verified: bool


class JourneyStepOut(BaseModel):
    id: str  # the Story id (stable step anchor)
    phase: EJourneyPhase
    title: str
    purpose: str
    state: EStepState
    applicable: bool
    prerequisites: list[str]  # prerequisite Story ids
    skippable: bool
    inputs: list[str] = []
    decisions: list[dict] = []
    output: JourneyStepOutput | None = None
    surface: str | None = None  # "experience" | "topology" | "delivery"
    updated_at: str


class JourneyOut(BaseModel):
    id: str
    project_id: str
    steps: list[JourneyStepOut]


# --- Delivery plan (GIN-429) — projection of the real Epic→Story→Task tree ---
# The FE (lib/journey/delivery-plan.ts) computes readiness/coverage/first-cycle
# from this tree client-side. The layer/hasTest/screens taxonomy has no backend
# source, so those fields are omitted (optional FE-side) rather than fabricated.


class PlanTaskOut(BaseModel):
    id: str
    title: str
    owner: str | None = None


class PlanStoryOut(BaseModel):
    id: str
    title: str
    outcome: str = ""
    tasks: list[PlanTaskOut]


class PlanEpicOut(BaseModel):
    id: str
    title: str
    stories: list[PlanStoryOut]


class DeliveryPlanOut(BaseModel):
    epics: list[PlanEpicOut]


class StartDeliveryPayload(BaseModel):
    title: str
    story_ids: list[str] = []


# --- Existing-project discovery (GIN-432) ---
# Evidence + detected components projected from the project's real repositories,
# documents and backlog. The user's curated + approved baseline persists via the
# shared contract store (doc_type discovery_baseline).


class EvidenceItemOut(BaseModel):
    id: str
    kind: str  # repository | document | deployment | design | backlog
    name: str
    status: str  # confirmed | attention | unknown
    confidence: float
    note: str | None = None


class DetectedComponentOut(BaseModel):
    id: str
    name: str
    type: str
    confidence: float
    evidence: str
    confirmed: bool


class DiscoveryOut(BaseModel):
    evidence: list[EvidenceItemOut]
    components: list[DetectedComponentOut]
