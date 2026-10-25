from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

#: One workspace-year of public holidays plus company days, with room to spare.
#: A cap exists because this is a column, not a table — an unbounded list would
#: turn every workspace read into an unbounded payload.
MAX_HOLIDAYS = 200


class WorkspaceHoliday(BaseModel):
    """A single non-working day. The name is for the tooltip, not identity —
    the date is what the charts and any future scheduling read."""

    date: date
    name: str = Field(min_length=1, max_length=120)


class CreateWorkspacePayload(BaseModel):
    """Matches the frontend's ICreateWorkspacePayload."""

    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(min_length=2, max_length=48, pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


class UpdateWorkspacePayload(BaseModel):
    #: Both optional so a caller can change the holidays without restating the
    #: name (and vice versa). Omitted means "leave alone", not "clear".
    name: str | None = Field(default=None, min_length=1, max_length=120)
    holidays: list[WorkspaceHoliday] | None = None

    @field_validator("holidays")
    @classmethod
    def _tidy(cls, value: list[WorkspaceHoliday] | None) -> list[WorkspaceHoliday] | None:
        """One entry per date, in order.

        Normalized on the way in rather than on the way out: a duplicate date
        would silently double-count against any consumer that builds a set, and
        every reader would otherwise have to re-sort a list the writer could
        have sorted once.
        """
        if value is None:
            return None
        if len(value) > MAX_HOLIDAYS:
            raise ValueError(f"At most {MAX_HOLIDAYS} holidays")
        by_date = {h.date: h for h in value}
        return [by_date[d] for d in sorted(by_date)]


class WorkspaceOut(BaseModel):
    """Matches the frontend's IWorkspace (src/types/workspace.ts)."""

    id: str
    slug: str
    name: str
    logo_url: str | None
    member_count: int
    project_count: int
    github_connected: bool
    github_repo_url: str | None
    holidays: list[WorkspaceHoliday]
    created_at: datetime
    updated_at: datetime
