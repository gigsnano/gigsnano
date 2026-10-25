"""Templates & Recurring Work (GIN-238): reusable project / work-item templates.

A project template captures config + a Foundation seed; a work-item template
captures a preset Story `fields` dict (+ optional child checklist items). Templates
are private to their workspace or public/shareable. Recurring items are NOT a new
model — a recurrence is an AutomationRule (trigger_event="schedule") whose action
is create_from_template, swept by the recurrence scheduler (see automations)."""

from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class Template(TimestampedBase):
    __tablename__ = "templates"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))                # project | work_item
    name: Mapped[str] = mapped_column(String(120))
    visibility: Mapped[str] = mapped_column(String(10), default="private")  # private | public
    # work_item: {fields: {...Story cols...}, checklist: [str]}
    # project:   {foundation: {...lock_foundation kwargs...}, labels: [str]}
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
