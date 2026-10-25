"""Smart Intake: Customer records + a Triage queue isolated from the project
workflow (GIN-213). Inbound requests (personal/private capture, in-app guest,
public form, email, or from a Customer) land as TriageItem rows; the Analyst
engine (GIN-214) classifies/dedupes/enriches/routes them, and accepting one
publishes a real Story (created_story_id) — the triage row is never a Story, so
it never leaks into boards/counts/analytics (same discipline as StoryDraft)."""

import enum

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class ETriageSource(str, enum.Enum):
    PERSONAL = "personal"        # a member privately captures a request (beyond Plane)
    IN_APP = "in_app"            # in-app guest submit
    PUBLIC_FORM = "public_form"  # unauthenticated public form
    EMAIL = "email"              # inbound email → request
    CUSTOMER = "customer"        # raised against a Customer record


class ETriageStatus(str, enum.Enum):
    NEW = "new"            # captured, not yet triaged
    TRIAGED = "triaged"    # Analyst engine ran: classified/deduped/enriched/routed
    ACCEPTED = "accepted"  # published into a Story
    DISMISSED = "dismissed"


TRIAGE_SOURCE_ENUM = Enum(ETriageSource, name="triage_source", values_callable=_values)
TRIAGE_STATUS_ENUM = Enum(ETriageStatus, name="triage_status", values_callable=_values)


class Customer(TimestampedBase):
    """Lightweight client record carrying context + a priority weight that lifts
    the priority of requests raised on its behalf."""

    __tablename__ = "customers"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320), default=None)
    # 0 = normal … 3 = strategic. Feeds priority = max(impact, weight) at triage.
    priority_weight: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )


class TriageItem(TimestampedBase):
    __tablename__ = "triage_items"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    # Target project for the eventual Story; may be null on public/email capture and
    # is chosen at accept time.
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), default=None
    )
    source: Mapped[ETriageSource] = mapped_column(TRIAGE_SOURCE_ENUM)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)  # private items are member/ws-scoped
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    customer_id: Mapped[str | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), default=None
    )
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None  # null for anon/email
    )
    status: Mapped[ETriageStatus] = mapped_column(
        TRIAGE_STATUS_ENUM, default=ETriageStatus.NEW, index=True
    )
    # Analyst engine output (GIN-214)
    classification: Mapped[dict] = mapped_column(JSON, default=dict)          # {domain, task_type}
    enriched_title: Mapped[str | None] = mapped_column(String(300), default=None)
    enriched_description: Mapped[str | None] = mapped_column(Text, default=None)
    priority: Mapped[str | None] = mapped_column(String(10), default=None)    # EStoryPriority value
    duplicate_ids: Mapped[list] = mapped_column(JSON, default=list)           # [{story_id, story_number, title}]
    recommended_route: Mapped[dict] = mapped_column(JSON, default=dict)       # route_task() output
    created_story_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None
    )
