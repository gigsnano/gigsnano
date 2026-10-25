from datetime import date
from typing import Literal

from pydantic import BaseModel

TReportRange = Literal["7d", "30d", "quarter"]
TReportBucket = Literal["day", "week"]


class ReportBucketOut(BaseModel):
    start: date
    completed: int


class ThroughputOut(BaseModel):
    total: int
    previous_total: int
    buckets: list[ReportBucketOut]


class OnTimeOut(BaseModel):
    done_with_target: int
    on_time: int
    pct: int | None
    previous_pct: int | None


class AtRiskOut(BaseModel):
    at_risk: int
    off_track: int
    total_projects: int


class TeamLoadOut(BaseModel):
    user_id: str | None
    display_name: str
    open: int


class CycleReportOut(BaseModel):
    cycle_id: str
    cycle_name: str
    project_id: str
    project_name: str
    status: Literal["active", "completed"]
    total: int
    done: int
    pct: int
    end_date: date | None


class ReportsOut(BaseModel):
    range: TReportRange
    period_from: date
    period_to: date
    bucket: TReportBucket
    throughput: ThroughputOut
    on_time: OnTimeOut
    at_risk: AtRiskOut
    team_load: list[TeamLoadOut]
    cycles: list[CycleReportOut]
