import enum
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase, _values


class EJobType(str, enum.Enum):
    HOURLY = "hourly"
    FIXED = "fixed"


class EExperienceLevel(str, enum.Enum):
    ENTRY = "entry"
    INTERMEDIATE = "intermediate"
    EXPERT = "expert"


class ETalentBadge(str, enum.Enum):
    TOP_RATED_PLUS = "top_rated_plus"
    TOP_RATED = "top_rated"
    RISING_TALENT = "rising_talent"


JOB_TYPE_ENUM = Enum(EJobType, name="job_type", values_callable=_values)
EXPERIENCE_LEVEL_ENUM = Enum(EExperienceLevel, name="experience_level", values_callable=_values)
TALENT_BADGE_ENUM = Enum(ETalentBadge, name="talent_badge", values_callable=_values)


class MarketplaceJob(TimestampedBase):
    """Read-only marketplace job listing (mirrors frontend IMarketplaceJob).
    The nested `client` object is flattened into typed `client_*` columns and
    rebuilt in the serializer. `sort_order` fixes display order; never serialized."""

    __tablename__ = "marketplace_jobs"

    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    posted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    job_type: Mapped[EJobType] = mapped_column(JOB_TYPE_ENUM)
    hourly_min: Mapped[int | None] = mapped_column(Integer, default=None)
    hourly_max: Mapped[int | None] = mapped_column(Integer, default=None)
    fixed_budget: Mapped[int | None] = mapped_column(Integer, default=None)
    experience_level: Mapped[EExperienceLevel] = mapped_column(EXPERIENCE_LEVEL_ENUM)
    duration_label: Mapped[str] = mapped_column(String(80))
    hours_per_week_label: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(80))
    skills: Mapped[list] = mapped_column(JSON, default=list)
    proposals_label: Mapped[str] = mapped_column(String(40))
    interviewing: Mapped[int] = mapped_column(Integer, default=0)
    invites_sent: Mapped[int] = mapped_column(Integer, default=0)

    client_payment_verified: Mapped[bool] = mapped_column(Boolean)
    client_rating: Mapped[float] = mapped_column(Float)
    client_reviews_count: Mapped[int] = mapped_column(Integer)
    client_total_spent_usd: Mapped[int] = mapped_column(Integer)
    client_avg_hourly_paid: Mapped[int | None] = mapped_column(Integer, default=None)
    client_hires: Mapped[int] = mapped_column(Integer)
    client_country: Mapped[str] = mapped_column(String(80))
    client_jobs_posted: Mapped[int] = mapped_column(Integer)
    client_hire_rate_pct: Mapped[int] = mapped_column(Integer)
    client_industry: Mapped[str] = mapped_column(String(120))
    client_company_size: Mapped[str] = mapped_column(String(80))
    client_member_since: Mapped[str] = mapped_column(String(40))

    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Freelancer(TimestampedBase):
    """Read-only freelancer profile (mirrors frontend IFreelancer).
    `work_history` and the string-array fields are JSON; `sort_order` fixes
    display order and is never serialized."""

    __tablename__ = "freelancers"

    name: Mapped[str] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(String(500), default=None)
    title: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(80))
    hourly_rate: Mapped[int] = mapped_column(Integer)
    job_success_pct: Mapped[int] = mapped_column(Integer)
    badge: Mapped[ETalentBadge | None] = mapped_column(TALENT_BADGE_ENUM, default=None)
    total_earned_label: Mapped[str] = mapped_column(String(40))
    jobs_count: Mapped[int] = mapped_column(Integer)
    hours_worked: Mapped[int] = mapped_column(Integer)
    available_now: Mapped[bool] = mapped_column(Boolean)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    overview: Mapped[str] = mapped_column(Text, default="")
    languages: Mapped[list] = mapped_column(JSON, default=list)
    verifications: Mapped[list] = mapped_column(JSON, default=list)
    hours_per_week_label: Mapped[str] = mapped_column(String(80))
    member_since: Mapped[str] = mapped_column(String(40))
    work_history: Mapped[list] = mapped_column(JSON, default=list)

    sort_order: Mapped[int] = mapped_column(Integer, default=0)
