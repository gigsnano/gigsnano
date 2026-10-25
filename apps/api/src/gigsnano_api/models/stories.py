import enum
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import JSON_DOC, TimestampedBase, _values


class EStoryStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"


class EStoryPriority(str, enum.Enum):
    URGENT = "urgent"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


class EStoryType(str, enum.Enum):
    EPIC = "epic"
    FEATURE = "feature"
    STORY = "story"
    TASK = "task"
    BUG = "bug"


class EReadinessResult(str, enum.Enum):
    PASS = "pass"  # nosec B105 - readiness verdict, not a password
    CONCERNS = "concerns"
    FAIL = "fail"


class ESimpleSize(str, enum.Enum):
    """T-shirt sizes for the "simple" planning method (GIN-331). Stored as the
    lowercase value on Story.size; null = unestimated (never a fabricated zero)."""

    XS = "xs"
    S = "s"
    M = "m"
    L = "l"
    XL = "xl"


STORY_STATUS_ENUM = Enum(EStoryStatus, name="story_status", values_callable=_values)
STORY_PRIORITY_ENUM = Enum(EStoryPriority, name="story_priority", values_callable=_values)
STORY_TYPE_ENUM = Enum(EStoryType, name="story_type", values_callable=_values)
READINESS_ENUM = Enum(EReadinessResult, name="readiness_result", values_callable=_values)


class Story(TimestampedBase):
    __tablename__ = "stories"
    __table_args__ = (UniqueConstraint("project_id", "story_number"),)

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    cycle_id: Mapped[str | None] = mapped_column(
        ForeignKey("cycles.id", ondelete="SET NULL"), default=None, index=True
    )
    module_id: Mapped[str | None] = mapped_column(
        ForeignKey("modules.id", ondelete="SET NULL"), default=None, index=True
    )
    # Roadmap links (GIN-206): a work item rolls up into at most one milestone/release.
    milestone_id: Mapped[str | None] = mapped_column(
        ForeignKey("milestones.id", ondelete="SET NULL"), default=None, index=True
    )
    release_id: Mapped[str | None] = mapped_column(
        ForeignKey("releases.id", ondelete="SET NULL"), default=None, index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None, index=True
    )
    # Source-traceability for duplicated items (GIN-355): the work item this one was
    # cloned from. Nulled if the source is deleted; independent of "duplicate" relations
    # (which express issue consolidation, a separate product action).
    cloned_from_id: Mapped[str | None] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None, index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    # Canonical content (GIN-300). NULL means "no canonical copy yet" — the normal
    # state for editor-authored HTML until GIN-308 backfills it — so `description`
    # stays authoritative until content_json_read is on. See content/fields.py.
    description_json: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)
    status: Mapped[EStoryStatus] = mapped_column(STORY_STATUS_ENUM, default=EStoryStatus.TODO)
    priority: Mapped[EStoryPriority] = mapped_column(
        STORY_PRIORITY_ENUM, default=EStoryPriority.NONE
    )
    # Work-item type (Plane-style). Defaults to STORY; BMAD "create-epics-and-stories"
    # sets EPIC/STORY/TASK on generated items (Phase 3).
    type: Mapped[EStoryType] = mapped_column(STORY_TYPE_ENUM, default=EStoryType.STORY)
    start_date: Mapped[date | None] = mapped_column(Date, default=None)
    target_date: Mapped[date | None] = mapped_column(Date, default=None)
    # "order" in the JSON contract; renamed here because ORDER is an SQL keyword.
    sort_order: Mapped[float] = mapped_column(Float, default=0.0)
    # Per-project human-readable sequence; rendered as f"{project.identifier}-{story_number}".
    # Assigned at creation, stable thereafter. Nullable only for pre-backfill rows.
    story_number: Mapped[int | None] = mapped_column(Integer, default=None)
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), default=None)
    # AI-agent assignee for manual (non-BMAD) stories; a BMAD_AGENTS roster id
    # (not a FK — the roster is a static constant, not a table). Sprint-0 cards
    # derive their agent from bmad_agent instead.
    ai_agent_id: Mapped[str | None] = mapped_column(String(40), default=None)
    # Labels live in the `story_labels` association table (GIN-475) — a story has
    # many. There is deliberately no `label_id` column left to drift out of sync.
    estimate_id: Mapped[str | None] = mapped_column(
        ForeignKey("project_estimates.id", ondelete="SET NULL"), default=None
    )
    estimate_points: Mapped[int | None] = mapped_column(Integer, default=None)
    # Per-method estimate inputs (GIN-331). Independent columns so switching a
    # project's planning method preserves each mode's prior raw value instead of
    # coercing points↔sizes↔time. null = unestimated (never zero).
    #  - `size`: an ESimpleSize value ("xs".."xl") for the "simple" method.
    #  - `duration_minutes`: whole minutes for the "time" method; never derived
    #    from points/sizes.
    size: Mapped[str | None] = mapped_column(String(2), default=None)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, default=None)

    # BMAD Sprint-0 metadata — null bmad_workflow ⇒ ordinary product story.
    bmad_workflow: Mapped[str | None] = mapped_column(String(80), default=None)
    bmad_agent: Mapped[str | None] = mapped_column(String(80), default=None)
    bmad_artifact: Mapped[str | None] = mapped_column(String(120), default=None)
    bmad_is_locked: Mapped[bool] = mapped_column(Boolean, default=True)
    bmad_is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    bmad_skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    bmad_readiness_result: Mapped[EReadinessResult | None] = mapped_column(
        READINESS_ENUM, default=None
    )

    # Soft delete (GIN-97). A non-null deleted_at means the item is in the
    # workspace trash: excluded from every normal read by the global
    # do_orm_execute filter, restored/purged via the trash endpoints. Cascade
    # subtrees keep parent_id intact so restore/purge can re-walk them.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None, index=True
    )
    deleted_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )


class StoryDraft(TimestampedBase):
    """An unsaved 'create work item' form, persisted per user so an accidental
    dismiss (or an explicit 'save as draft') doesn't lose work. Deliberately NOT
    a Story row — drafts must never leak into boards/counts/analytics/exports;
    publishing creates a real Story and deletes the draft (GIN-16)."""

    __tablename__ = "story_drafts"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    created_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class EStoryRelationType(str, enum.Enum):
    """Serialized values match the frontend EStoryRelationType."""

    RELATES_TO = "relates_to"
    BLOCKING = "blocking"
    BLOCKED_BY = "blocked_by"
    DUPLICATE = "duplicate"


class EStoryActivityKind(str, enum.Enum):
    PROPERTY = "property"
    COMMENT = "comment"
    TRANSITION = "transition"


class EStoryActivityField(str, enum.Enum):
    CREATED = "created"
    TITLE = "title"
    DESCRIPTION = "description"
    STATUS = "status"
    PRIORITY = "priority"
    ASSIGNEE = "assignee"
    START_DATE = "start_date"
    TARGET_DATE = "target_date"
    LABEL = "label"
    PARENT = "parent"
    CYCLE = "cycle"
    MODULE = "module"
    LINK = "link"
    ATTACHMENT = "attachment"
    RELATION = "relation"


STORY_RELATION_TYPE_ENUM = Enum(
    EStoryRelationType, name="story_relation_type", values_callable=_values
)
STORY_ACTIVITY_KIND_ENUM = Enum(
    EStoryActivityKind, name="story_activity_kind", values_callable=_values
)
STORY_ACTIVITY_FIELD_ENUM = Enum(
    EStoryActivityField, name="story_activity_field", values_callable=_values
)


class StoryLink(TimestampedBase):
    __tablename__ = "story_links"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    url: Mapped[str] = mapped_column(String(2000))
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    created_by_name: Mapped[str] = mapped_column(String(120))


class StoryRelation(TimestampedBase):
    __tablename__ = "story_relations"
    __table_args__ = (
        UniqueConstraint("story_id", "related_story_id", "relation_type"),
    )

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    related_story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    relation_type: Mapped[EStoryRelationType] = mapped_column(STORY_RELATION_TYPE_ENUM)


class StoryComment(TimestampedBase):
    __tablename__ = "story_comments"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(Text)
    body_json: Mapped[dict | None] = mapped_column(JSON_DOC, default=None)  # GIN-300
    author_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    author_name: Mapped[str] = mapped_column(String(120))
    author_avatar_url: Mapped[str | None] = mapped_column(String(500), default=None)


class TimeEntry(TimestampedBase):
    """Hours logged against a work item by a user (GIN-55 time tracking).

    Denormalizes the logger's name/avatar like StoryComment so the feed renders
    without a join. `created_at` (from TimestampedBase) is the logged timestamp.
    """

    __tablename__ = "time_entries"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None, index=True
    )
    user_name: Mapped[str] = mapped_column(String(120))
    user_avatar_url: Mapped[str | None] = mapped_column(String(500), default=None)
    hours: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(Text, default="")


class StoryActivity(TimestampedBase):
    __tablename__ = "story_activities"

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[EStoryActivityKind] = mapped_column(STORY_ACTIVITY_KIND_ENUM)
    field: Mapped[EStoryActivityField | None] = mapped_column(
        STORY_ACTIVITY_FIELD_ENUM, default=None
    )
    actor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    actor_name: Mapped[str] = mapped_column(String(120))
    summary: Mapped[str] = mapped_column(String(300))
    old_value: Mapped[str | None] = mapped_column(Text, default=None)
    new_value: Mapped[str | None] = mapped_column(Text, default=None)


class StoryCustomFieldValue(TimestampedBase):
    __tablename__ = "story_custom_field_values"
    __table_args__ = (UniqueConstraint("story_id", "field_id"),)

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    field_id: Mapped[str] = mapped_column(
        ForeignKey("project_custom_fields.id", ondelete="CASCADE"), index=True
    )
    value: Mapped[str | None] = mapped_column(Text, default=None)


class StoryLabel(TimestampedBase):
    """Work item ↔ label, many-to-many (GIN-475). This table is the ONLY source of
    truth for a story's labels — the old singular `stories.label_id` column is gone.
    `label_ids` on the API is a set-replacement; ordering is by label name at read
    time, so there is no "primary" label to keep in sync."""

    __tablename__ = "story_labels"
    __table_args__ = (UniqueConstraint("story_id", "label_id"),)

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    label_id: Mapped[str] = mapped_column(
        ForeignKey("project_labels.id", ondelete="CASCADE"), index=True
    )


class StorySubscription(TimestampedBase):
    __tablename__ = "story_subscriptions"
    __table_args__ = (UniqueConstraint("story_id", "user_id"),)

    story_id: Mapped[str] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
