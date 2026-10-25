"""Persisted Execution Profile per work item (GIN-287): the resolver snapshot,
net user overrides, an override history, and the policy mode. The effective
profile a consumer sees = snapshot with overrides applied (service.effective)."""

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase

_JSON = JSON().with_variant(JSONB(), "postgresql")


class ExecutionProfile(TimestampedBase):
    __tablename__ = "execution_profiles"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), unique=True, index=True
    )
    agent: Mapped[str] = mapped_column(String(20), default="auto")
    policy: Mapped[str] = mapped_column(String(10), default="suggest")  # suggest | locked
    snapshot: Mapped[dict] = mapped_column(_JSON, default=dict)  # resolver base
    overrides: Mapped[dict] = mapped_column(_JSON, default=dict)  # {skillId: {mode}}
    override_history: Mapped[list] = mapped_column(_JSON, default=list)  # [{reason, changes}]
