"""Entity + date resolution for voice commands (GIN-506).

Speech gives us a phrase, not an id. This module turns "chess", "Divya" and
"tomorrow" into concrete values — or into a `ResolvedField` that says honestly
that it could not, which is the more important half.

Three rules shape everything here:

1. **Never silently pick between duplicates for a write.** Two people called
   Divya means one clarifying question, not a coin flip. The margin below is what
   "close enough to be a coin flip" means numerically.
2. **Inaccessible is not a near miss.** Candidates the actor cannot see are
   filtered out *before* ranking, so they can neither be selected nor hinted at
   by a "did you mean" list. The org chart is not a voice-discoverable resource.
3. **Relative dates resolve in the speaker's timezone.** "Tomorrow" said at
   23:00 in Dubai is not the server's tomorrow.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.models import Project, Story, WorkspaceMember
from gigsnano_api.shared.context import WorkspaceContext, accessible_project_ids
from gigsnano_api.voice.commands import Candidate, EFieldState, ResolvedField

#: Below this, a match is noise rather than a candidate.
MATCH_FLOOR = 0.55

#: If the runner-up is within this of the leader, the two are indistinguishable
#: and we ask. Tuned to catch "Chess" vs "Chess Portal", which differ by very
#: little as strings and by a great deal as destinations for a bug report.
AMBIGUITY_MARGIN = 0.12

_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def fold(text: str) -> str:
    """Casefold and strip accents so "Chloé" matches "chloe".

    Speech-to-text is inconsistent about diacritics; a name that only matches when
    the transcriber happened to include the accent is a name that fails at random.
    """
    decomposed = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold().strip()


@dataclass
class Scored:
    id: str
    label: str
    score: float
    evidence: str


def score(phrase: str, label: str) -> tuple[float, str]:
    """Score with the reason attached — a wrong resolution has to be explainable
    after the fact, and 'fuzzy match 0.71' is the only thing that explains it."""
    said, target = fold(phrase), fold(label)
    if not said or not target:
        return 0.0, ""
    if said == target:
        return 1.0, f"exact match on {label!r}"
    if target.startswith(said):
        # Long prefixes are strong, but never as strong as an exact hit, or
        # "Chess" would beat itself against "Chess Portal".
        return 0.75 + 0.2 * (len(said) / len(target)), f"{label!r} starts with {phrase!r}"
    if said in target:
        return 0.7, f"{label!r} contains {phrase!r}"
    return SequenceMatcher(None, said, target).ratio(), f"fuzzy match on {label!r}"


def rank(phrase: str, rows: list[tuple[str, str]]) -> ResolvedField:
    """Turn (id, label) pairs into a resolved, ambiguous or missing field."""
    scored = sorted(
        (Scored(rid, label, *score(phrase, label)) for rid, label in rows),
        key=lambda s: s.score,
        reverse=True,
    )
    viable = [s for s in scored if s.score >= MATCH_FLOOR]
    if not viable:
        return ResolvedField(state=EFieldState.MISSING, evidence=f"nothing matched {phrase!r}")

    leader = viable[0]
    contenders = [s for s in viable if leader.score - s.score <= AMBIGUITY_MARGIN]
    if len(contenders) > 1:
        return ResolvedField(
            state=EFieldState.AMBIGUOUS,
            candidates=[
                Candidate(id=s.id, label=s.label, evidence=s.evidence, confidence=round(s.score, 3))
                for s in contenders
            ],
            evidence=f"{len(contenders)} candidates within {AMBIGUITY_MARGIN} of each other",
        )
    return ResolvedField(
        state=EFieldState.RESOLVED,
        value=leader.id,
        evidence=leader.evidence,
        confidence=round(leader.score, 3),
    )


# ── Entity resolvers (RBAC-filtered before ranking) ──────────────────────────


async def resolve_project(db: AsyncSession, ctx: WorkspaceContext, phrase: str) -> ResolvedField:
    allowed = await accessible_project_ids(db, ctx)  # None = owner/admin, sees all
    query = select(Project.id, Project.name, Project.identifier).where(
        Project.workspace_id == ctx.workspace.id
    )
    if allowed is not None:
        query = query.where(Project.id.in_(allowed))
    rows = (await db.execute(query)).all()
    # A project answers to its name or its identifier ("GIN"), because people say both.
    pairs = [(r.id, r.name) for r in rows] + [(r.id, r.identifier) for r in rows if r.identifier]
    return _best_of(phrase, pairs)


async def resolve_person(db: AsyncSession, ctx: WorkspaceContext, phrase: str) -> ResolvedField:
    """Members only. A user who exists but is not in this workspace is not a
    candidate and is not mentioned — same reasoning as inaccessible projects."""
    rows = (
        await db.execute(
            select(User.id, User.display_name)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(WorkspaceMember.workspace_id == ctx.workspace.id)
        )
    ).all()
    return rank(phrase, [(r.id, r.display_name or "") for r in rows])


async def resolve_work_item(db: AsyncSession, ctx: WorkspaceContext, phrase: str) -> ResolvedField:
    """A code is exact and wins outright; otherwise fall back to titles.

    `code` is composed rather than stored — it is `f"{identifier}-{story_number}"`
    everywhere else in the codebase, so it is composed the same way here.
    """
    allowed = await accessible_project_ids(db, ctx)
    query = (
        select(Story.id, Story.story_number, Story.title, Project.identifier)
        .join(Project, Project.id == Story.project_id)
        .where(Project.workspace_id == ctx.workspace.id)
    )
    if allowed is not None:
        query = query.where(Story.project_id.in_(allowed))
    rows = (await db.execute(query)).all()

    said = fold(phrase)
    for row in rows:
        code = f"{row.identifier}-{row.story_number}"
        if fold(code) == said:
            return ResolvedField(
                state=EFieldState.RESOLVED,
                value=row.id,
                evidence=f"work-item code {code}",
                confidence=1.0,
            )
    return rank(phrase, [(r.id, r.title) for r in rows])


def _best_of(phrase: str, pairs: list[tuple[str, str]]) -> ResolvedField:
    """Rank, then collapse candidates that are the same entity under two labels —
    a project matching on both its name and its identifier is not ambiguous."""
    field = rank(phrase, pairs)
    if field.state is not EFieldState.AMBIGUOUS:
        return field
    unique = {c.id: c for c in field.candidates}
    if len(unique) == 1:
        only = next(iter(unique.values()))
        return ResolvedField(
            state=EFieldState.RESOLVED,
            value=only.id,
            evidence=only.evidence,
            confidence=only.confidence,
        )
    return field


#: Which resolver owns each field name, for revalidation.
_RESOLVERS = {
    "project": resolve_project,
    "assignee": resolve_person,
    "code": resolve_work_item,
    "parent": resolve_work_item,
}


async def revalidate(db: AsyncSession, ctx: WorkspaceContext, command) -> list[str]:
    """Re-check resolved ids against live access, returning the fields that no
    longer hold.

    Resolution and execution are separated by a confirmation the user may sit on
    for minutes. In that window a project can be archived or a member removed, and
    a confirmation the user gave against the old world must not authorise a write
    into the new one.
    """
    stale: list[str] = []
    for name, field in command.fields.items():
        resolver = _RESOLVERS.get(name)
        if resolver is None or not field.usable:
            continue
        rows = await _visible_ids(db, ctx, resolver)
        if field.value not in rows:
            stale.append(name)
    return stale


async def _visible_ids(db: AsyncSession, ctx: WorkspaceContext, resolver) -> set[str]:
    """The id set the actor can currently see for that resolver's entity."""
    if resolver is resolve_project:
        allowed = await accessible_project_ids(db, ctx)
        query = select(Project.id).where(Project.workspace_id == ctx.workspace.id)
        if allowed is not None:
            query = query.where(Project.id.in_(allowed))
    elif resolver is resolve_person:
        query = select(WorkspaceMember.user_id).where(
            WorkspaceMember.workspace_id == ctx.workspace.id
        )
    else:
        allowed = await accessible_project_ids(db, ctx)
        query = (
            select(Story.id)
            .join(Project, Project.id == Story.project_id)
            .where(Project.workspace_id == ctx.workspace.id)
        )
        if allowed is not None:
            query = query.where(Story.project_id.in_(allowed))
    return {row[0] for row in (await db.execute(query)).all()}


# ── Dates ────────────────────────────────────────────────────────────────────


def resolve_date(phrase: str, *, timezone: str = "UTC", now: datetime | None = None) -> ResolvedField:
    """Relative and absolute dates, in the speaker's timezone.

    Ambiguous all-numeric forms like 03/04/2026 are refused rather than guessed:
    the difference between March and April on a due date is a missed deadline, and
    there is no locale signal in speech that makes the guess safe.
    """
    try:
        zone = ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return ResolvedField(state=EFieldState.INVALID, evidence=f"unknown timezone {timezone!r}")

    today = (now.astimezone(zone) if now else datetime.now(zone)).date()
    said = fold(phrase)

    fixed = {"today": 0, "tomorrow": 1, "yesterday": -1}
    if said in fixed:
        return _date_field(today + timedelta(days=fixed[said]), f"{said} in {timezone}")

    if match := re.fullmatch(r"in (\d+) days?", said):
        return _date_field(today + timedelta(days=int(match[1])), f"{said} from {today}")

    if match := re.fullmatch(r"(?:next |this )?(\w+day)", said):
        if (index := _WEEKDAYS.get(match[1])) is not None:
            ahead = (index - today.weekday()) % 7 or 7
            return _date_field(today + timedelta(days=ahead), f"next {match[1]} in {timezone}")

    if re.fullmatch(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}", said):
        return ResolvedField(
            state=EFieldState.AMBIGUOUS,
            evidence=f"{phrase!r} could be day-first or month-first",
            candidates=[
                Candidate(id=iso, label=iso, evidence=order, confidence=0.5)
                for iso, order in _both_readings(said)
            ],
        )

    for fmt in ("%Y-%m-%d", "%d %B %Y", "%B %d %Y", "%d %B", "%B %d"):
        try:
            parsed = datetime.strptime(phrase.strip(), fmt).date()
        except ValueError:
            continue
        if "%Y" not in fmt:  # "March 3" means the next one, not year 1900
            parsed = parsed.replace(year=today.year)
            if parsed < today:
                parsed = parsed.replace(year=today.year + 1)
        return _date_field(parsed, f"parsed {phrase!r} as {fmt}")

    return ResolvedField(state=EFieldState.MISSING, evidence=f"no date found in {phrase!r}")


def _both_readings(said: str) -> list[tuple[str, str]]:
    a, b, y = (int(p) for p in re.split(r"[/-]", said))
    year = y + 2000 if y < 100 else y
    out = []
    for day, month, order in ((a, b, "day-first"), (b, a, "month-first")):
        try:
            out.append((date(year, month, day).isoformat(), order))
        except ValueError:
            continue  # 13/04 has only one legal reading, which is the point
    return out


def _date_field(value: date, evidence: str) -> ResolvedField:
    return ResolvedField(
        state=EFieldState.RESOLVED, value=value.isoformat(), evidence=evidence, confidence=1.0
    )
