"""Marketplace catalog — read-only jobs + talent (mirrors marketplace.service).
Global domain (not workspace-scoped); every route requires a signed-in user."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.deps import get_current_user
from gigsnano_api.auth.models import User
from gigsnano_api.core.db import get_db
from gigsnano_api.features.marketplace_talent.schemas import (
    FreelancerOut,
    JobClientOut,
    MarketplaceJobOut,
    WorkHistoryItemOut,
)
from gigsnano_api.models import Freelancer, MarketplaceJob

router = APIRouter(tags=["marketplace"])


def _job_out(j: MarketplaceJob) -> MarketplaceJobOut:
    return MarketplaceJobOut(
        id=j.id, title=j.title, description=j.description, posted_at=j.posted_at,
        job_type=j.job_type, hourly_min=j.hourly_min, hourly_max=j.hourly_max,
        fixed_budget=j.fixed_budget, experience_level=j.experience_level,
        duration_label=j.duration_label, hours_per_week_label=j.hours_per_week_label,
        category=j.category, skills=j.skills, proposals_label=j.proposals_label,
        interviewing=j.interviewing, invites_sent=j.invites_sent,
        client=JobClientOut(
            payment_verified=j.client_payment_verified, rating=j.client_rating,
            reviews_count=j.client_reviews_count, total_spent_usd=j.client_total_spent_usd,
            avg_hourly_paid=j.client_avg_hourly_paid, hires=j.client_hires,
            country=j.client_country, jobs_posted=j.client_jobs_posted,
            hire_rate_pct=j.client_hire_rate_pct, industry=j.client_industry,
            company_size=j.client_company_size, member_since=j.client_member_since,
        ),
    )


def _freelancer_out(f: Freelancer) -> FreelancerOut:
    return FreelancerOut(
        id=f.id, name=f.name, avatar_url=f.avatar_url, title=f.title, country=f.country,
        city=f.city, hourly_rate=f.hourly_rate, job_success_pct=f.job_success_pct,
        badge=f.badge, total_earned_label=f.total_earned_label, jobs_count=f.jobs_count,
        hours_worked=f.hours_worked, available_now=f.available_now, skills=f.skills,
        overview=f.overview, languages=f.languages, verifications=f.verifications,
        hours_per_week_label=f.hours_per_week_label, member_since=f.member_since,
        work_history=[WorkHistoryItemOut(**w) for w in f.work_history],
    )


@router.get("/marketplace/jobs/", response_model=list[MarketplaceJobOut])
async def list_jobs(
    _user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    rows = (await db.execute(
        select(MarketplaceJob).order_by(MarketplaceJob.sort_order)
    )).scalars().all()
    return [_job_out(j) for j in rows]


@router.get("/marketplace/jobs/{job_id}/", response_model=MarketplaceJobOut)
async def get_job(
    job_id: str, _user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    job = await db.get(MarketplaceJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return _job_out(job)


@router.get("/marketplace/talent/", response_model=list[FreelancerOut])
async def list_talent(
    _user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    rows = (await db.execute(
        select(Freelancer).order_by(Freelancer.sort_order)
    )).scalars().all()
    return [_freelancer_out(f) for f in rows]


@router.get("/marketplace/talent/{freelancer_id}/", response_model=FreelancerOut)
async def get_freelancer(
    freelancer_id: str, _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    f = await db.get(Freelancer, freelancer_id)
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Freelancer not found")
    return _freelancer_out(f)
