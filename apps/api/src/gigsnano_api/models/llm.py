import enum
from decimal import Decimal

from sqlalchemy import (
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class ELlmUsageSource(str, enum.Enum):
    BMAD_STORY = "bmad_story"
    GIGS_AI = "gigs_ai"
    # The daily digest's AI focus note (GIN-147). Recorded like any other call so its
    # cost is visible; whether it debits is a separate decision -- see
    # `settings.digest_ai_billed`.
    DIGEST = "digest"
    # A persona-owned autonomous agent run (GIN-250). Attributed to the user who
    # started it; debits the owning workspace wallet like any other AI call.
    AGENT_RUN = "agent_run"
    # Analyst triage enrichment of an inbound request (GIN-214).
    INTAKE = "intake"
    # An AI-persona approval gate reviewing a status transition (GIN-220).
    GATE = "gate"
    # Compiling a natural-language automation into a structured rule (GIN-252).
    AUTOMATION = "automation"
    # A persona drafting a project/work-item template from real patterns (GIN-241).
    TEMPLATE = "template"
    # A persona drafting a roadmap (initiatives/milestones/changelog) (GIN-207).
    ROADMAP = "roadmap"
    # Summary + action items extracted from a meeting transcript.
    MEETING_NOTES = "meeting_notes"
    # Classifying and analysing an imported document package.
    PACKAGE_IMPORT = "package_import"
    # Turning one spoken voice-agent utterance into a command.
    VOICE = "voice"


class ELlmUsageOperation(str, enum.Enum):
    STREAM_TURN = "stream_turn"
    EXTRACT = "extract"
    FINALIZE_DESCRIPTION = "finalize_description"


LLM_USAGE_SOURCE_ENUM = Enum(ELlmUsageSource, name="llm_usage_source", values_callable=_values)
LLM_USAGE_OPERATION_ENUM = Enum(ELlmUsageOperation, name="llm_usage_operation", values_callable=_values)


class LlmUsageEvent(TimestampedBase):
    __tablename__ = "llm_usage_events"
    __table_args__ = (Index("ix_llm_usage_events_created_workspace", "created_at", "workspace_id"),)

    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[ELlmUsageSource] = mapped_column(LLM_USAGE_SOURCE_ENUM)
    operation: Mapped[ELlmUsageOperation] = mapped_column(LLM_USAGE_OPERATION_ENUM)
    model: Mapped[str] = mapped_column(String(80))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), default=None)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), default=None)
    story_id: Mapped[str | None] = mapped_column(ForeignKey("stories.id", ondelete="SET NULL"), default=None)
    thread_id: Mapped[str | None] = mapped_column(String(36), default=None)
