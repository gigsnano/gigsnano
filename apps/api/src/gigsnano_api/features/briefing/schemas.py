from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from gigsnano_api.features.inbox.schemas import InboxCountsOut

Health = Literal["no_data", "on_track", "at_risk", "off_track"]


class BriefingCycleOut(BaseModel):
    id: str
    name: str
    days_left: int


class BriefingChangesOut(BaseModel):
    done: int
    created: int
    overdue: int
    docs_finalized: int


class BriefingProjectOut(BaseModel):
    id: str
    name: str
    identifier: str
    logo_emoji: str | None
    progress_pct: int
    total: int
    done: int
    health: Health
    target_date: date
    forecast_date: datetime | None
    slip_days: int | None
    cycle: BriefingCycleOut | None
    changes: BriefingChangesOut


class BriefingOut(BaseModel):
    generated_at: datetime
    since: datetime
    needs_you: InboxCountsOut
    projects: list[BriefingProjectOut]
