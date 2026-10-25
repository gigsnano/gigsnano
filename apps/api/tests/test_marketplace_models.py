from datetime import datetime, timezone

from gigsnano_api.models import (
    EExperienceLevel,
    EJobType,
    ETalentBadge,
    Freelancer,
    MarketplaceJob,
)


async def test_marketplace_job_roundtrip(db_session):
    job = MarketplaceJob(
        id="mj-test", title="Test Job", description="Body", sort_order=1,
        posted_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
        job_type=EJobType.HOURLY, hourly_min=25, hourly_max=50, fixed_budget=None,
        experience_level=EExperienceLevel.EXPERT, duration_label="Less than 1 month",
        hours_per_week_label="Less than 30 hrs/week", category="Web Development",
        skills=["React", "Node.js"], proposals_label="50+", interviewing=5, invites_sent=0,
        client_payment_verified=True, client_rating=5.0, client_reviews_count=11,
        client_total_spent_usd=2300, client_avg_hourly_paid=30, client_hires=11,
        client_country="Norway", client_jobs_posted=7, client_hire_rate_pct=100,
        client_industry="Tech & IT", client_company_size="Small company (2-9 people)",
        client_member_since="May 2024",
    )
    db_session.add(job)
    await db_session.commit()
    got = await db_session.get(MarketplaceJob, "mj-test")
    assert got.skills == ["React", "Node.js"]
    assert got.job_type == EJobType.HOURLY
    assert got.client_rating == 5.0
    assert got.fixed_budget is None


async def test_freelancer_roundtrip(db_session):
    f = Freelancer(
        id="mf-test", name="Test Dev", avatar_url=None, title="Full Stack", sort_order=1,
        country="India", city="Chandigarh", hourly_rate=25, job_success_pct=100,
        badge=ETalentBadge.TOP_RATED_PLUS, total_earned_label="$1M+", jobs_count=99,
        hours_worked=30991, available_now=True, skills=["React"], overview="Bio",
        languages=["English: Fluent"], verifications=["ID verified"],
        hours_per_week_label="More than 30 hrs/week", member_since="Mar 2014",
        work_history=[{"title": "A", "rating": 5.0, "period_label": "May 2026 - Jun 2026",
                       "amount_label": "30 hrs @ $25.00/hr", "feedback": "Great"}],
    )
    db_session.add(f)
    await db_session.commit()
    got = await db_session.get(Freelancer, "mf-test")
    assert got.work_history[0]["rating"] == 5.0
    assert got.badge == ETalentBadge.TOP_RATED_PLUS
    assert got.languages == ["English: Fluent"]
