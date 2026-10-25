from datetime import datetime

from pydantic import BaseModel

from gigsnano_api.models import EExperienceLevel, EJobType, ETalentBadge


class JobClientOut(BaseModel):
    """Mirrors frontend IJobClient."""

    payment_verified: bool
    rating: float
    reviews_count: int
    total_spent_usd: int
    avg_hourly_paid: int | None
    hires: int
    country: str
    jobs_posted: int
    hire_rate_pct: int
    industry: str
    company_size: str
    member_since: str


class MarketplaceJobOut(BaseModel):
    """Mirrors frontend IMarketplaceJob."""

    id: str
    title: str
    description: str
    posted_at: datetime
    job_type: EJobType
    hourly_min: int | None
    hourly_max: int | None
    fixed_budget: int | None
    experience_level: EExperienceLevel
    duration_label: str
    hours_per_week_label: str
    category: str
    skills: list[str]
    proposals_label: str
    interviewing: int
    invites_sent: int
    client: JobClientOut


class WorkHistoryItemOut(BaseModel):
    """Mirrors frontend IWorkHistoryItem."""

    title: str
    rating: float
    period_label: str
    amount_label: str
    feedback: str


class FreelancerOut(BaseModel):
    """Mirrors frontend IFreelancer."""

    id: str
    name: str
    avatar_url: str | None
    title: str
    country: str
    city: str
    hourly_rate: int
    job_success_pct: int
    badge: ETalentBadge | None
    total_earned_label: str
    jobs_count: int
    hours_worked: int
    available_now: bool
    skills: list[str]
    overview: str
    languages: list[str]
    verifications: list[str]
    hours_per_week_label: str
    member_since: str
    work_history: list[WorkHistoryItemOut]
