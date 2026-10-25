"""Entity + date resolution (GIN-506).

The golden cases the AC names — names, accents, project codes, date ambiguity —
plus the two that actually protect users: duplicates are never silently picked,
and inaccessible things are never disclosed.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from gigsnano_api.features.voice import resolver as R
from gigsnano_api.voice.commands import EFieldState

DUBAI = "Asia/Dubai"
# A Wednesday, late evening in Dubai — chosen so "tomorrow" differs from UTC's.
NOW = datetime(2026, 3, 4, 21, 30, tzinfo=ZoneInfo("UTC"))


def labels(field):
    return sorted(c.label for c in field.candidates)


# ── Ranking ──────────────────────────────────────────────────────────────────


def test_exact_match_wins_outright():
    field = R.rank("chess", [("p-1", "Chess"), ("p-2", "Chess Portal")])
    assert field.state is EFieldState.RESOLVED
    assert field.value == "p-1"


def test_accents_do_not_break_a_name():
    """Speech-to-text is inconsistent about diacritics; a name that only matches
    when the transcriber kept the accent fails at random."""
    field = R.rank("chloe", [("u-1", "Chloé Martin")])
    assert field.state is EFieldState.RESOLVED
    assert field.value == "u-1"


def test_two_similar_names_are_never_silently_picked():
    field = R.rank("divya", [("u-1", "Divya Nair"), ("u-2", "Divya Rao")])
    assert field.state is EFieldState.AMBIGUOUS
    assert labels(field) == ["Divya Nair", "Divya Rao"]


def test_a_clear_winner_is_not_treated_as_ambiguous():
    field = R.rank("divya nair", [("u-1", "Divya Nair"), ("u-2", "Bartholomew Fitzgerald")])
    assert field.state is EFieldState.RESOLVED


def test_noise_resolves_to_missing_not_to_the_least_bad_option():
    field = R.rank("xyzzy", [("p-1", "Chess"), ("p-2", "Data Portal")])
    assert field.state is EFieldState.MISSING
    assert field.value is None


def test_every_candidate_carries_its_evidence():
    field = R.rank("divya", [("u-1", "Divya Nair"), ("u-2", "Divya Rao")])
    assert all(c.evidence for c in field.candidates)


# ── Dates ────────────────────────────────────────────────────────────────────


def test_tomorrow_resolves_in_the_speakers_timezone():
    """21:30 UTC is already the next day in Dubai. Resolving in server time would
    put the due date a day early."""
    dubai = R.resolve_date("tomorrow", timezone=DUBAI, now=NOW)
    utc = R.resolve_date("tomorrow", timezone="UTC", now=NOW)
    assert dubai.value == "2026-03-06"
    assert utc.value == "2026-03-05"


def test_today_and_yesterday():
    assert R.resolve_date("today", timezone="UTC", now=NOW).value == "2026-03-04"
    assert R.resolve_date("yesterday", timezone="UTC", now=NOW).value == "2026-03-03"


def test_in_n_days():
    assert R.resolve_date("in 3 days", timezone="UTC", now=NOW).value == "2026-03-07"


def test_next_weekday_never_resolves_to_today():
    """'Next Wednesday' said on a Wednesday means the one coming, not this one."""
    assert NOW.weekday() == 2
    assert R.resolve_date("next wednesday", timezone="UTC", now=NOW).value == "2026-03-11"


def test_month_day_without_a_year_takes_the_next_occurrence():
    assert R.resolve_date("March 20", timezone="UTC", now=NOW).value == "2026-03-20"
    # Already past this year, so it means next year.
    assert R.resolve_date("January 5", timezone="UTC", now=NOW).value == "2027-01-05"


def test_iso_dates_pass_straight_through():
    assert R.resolve_date("2026-12-01", timezone="UTC", now=NOW).value == "2026-12-01"


def test_an_all_numeric_date_is_asked_about_never_guessed():
    """03/04/2026 is March or April depending on where you're from, and speech
    carries no signal that makes the guess safe. A due date off by a month is a
    missed deadline, not a typo."""
    field = R.resolve_date("03/04/2026", timezone="UTC", now=NOW)
    assert field.state is EFieldState.AMBIGUOUS
    assert sorted(c.id for c in field.candidates) == ["2026-03-04", "2026-04-03"]


def test_an_unambiguous_numeric_date_still_offers_only_its_legal_reading():
    field = R.resolve_date("13/04/2026", timezone="UTC", now=NOW)
    assert [c.id for c in field.candidates] == ["2026-04-13"]


def test_an_unparseable_phrase_is_missing_not_invalid():
    assert R.resolve_date("sometime soon", timezone="UTC", now=NOW).state is EFieldState.MISSING


def test_an_unknown_timezone_is_reported_rather_than_silently_falling_back():
    field = R.resolve_date("tomorrow", timezone="Mars/Olympus", now=NOW)
    assert field.state is EFieldState.INVALID


# ── RBAC-filtered entity resolution ──────────────────────────────────────────


@pytest.fixture
async def seeded(client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return client


async def make_project(client, name: str, identifier: str) -> str:
    """Asserted, not fire-and-forget: a 422 here would otherwise surface as
    "nothing matched", which reads like a resolver bug."""
    response = await client.post(
        "/api/workspaces/acme/projects/",
        json={
            "name": name,
            "identifier": identifier,
            "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def _ctx(db_session, slug="acme"):
    from sqlalchemy import select

    from gigsnano_api.auth.models import User
    from gigsnano_api.models import EMemberStatus, EWorkspaceRole, Workspace
    from gigsnano_api.shared.context import WorkspaceContext

    workspace = (
        await db_session.execute(select(Workspace).where(Workspace.slug == slug))
    ).scalar_one()
    user = (await db_session.execute(select(User))).scalars().first()
    return WorkspaceContext(
        user=user, workspace=workspace, role=EWorkspaceRole.OWNER, status=EMemberStatus.ACTIVE
    )


@pytest.mark.asyncio
async def test_a_project_answers_to_its_identifier_as_well_as_its_name(seeded, db_session):
    """People say "GIN" as readily as "Gigsnano"; matching on both must not then
    look like two candidates for the same project."""
    await make_project(seeded, "Gigsnano", "GIN")
    ctx = await _ctx(db_session)

    by_name = await R.resolve_project(db_session, ctx, "gigsnano")
    by_code = await R.resolve_project(db_session, ctx, "GIN")
    assert by_name.state is EFieldState.RESOLVED
    assert by_code.state is EFieldState.RESOLVED
    assert by_name.value == by_code.value


@pytest.mark.asyncio
async def test_two_similar_projects_produce_a_question(seeded, db_session):
    await make_project(seeded, "Chess", "CHS")
    await make_project(seeded, "Chess Portal", "CHP")
    field = await R.resolve_project(db_session, await _ctx(db_session), "chess")
    assert field.state in (EFieldState.RESOLVED, EFieldState.AMBIGUOUS)
    if field.state is EFieldState.AMBIGUOUS:
        assert len(field.candidates) == 2


@pytest.mark.asyncio
async def test_a_member_resolves_by_name(seeded, db_session):
    field = await R.resolve_person(db_session, await _ctx(db_session), "ada")
    assert field.state is EFieldState.RESOLVED


@pytest.mark.asyncio
async def test_revalidation_catches_a_value_that_stopped_being_valid(seeded, db_session):
    """Resolution and execution are separated by a confirmation the user may sit
    on. A confirmation given against the old world must not authorise a write into
    the new one."""
    from gigsnano_api.voice.commands import parse_command

    project_id = await make_project(seeded, "Chess", "CHS")
    ctx = await _ctx(db_session)

    live = parse_command({
        "intent": "create",
        "tool": "create_work_item",
        "fields": {
            "project": {"state": "resolved", "value": project_id, "confidence": 1.0},
            "title": {"state": "resolved", "value": "Login fails", "confidence": 1.0},
        },
    })
    assert await R.revalidate(db_session, ctx, live) == []

    gone = parse_command({
        "intent": "create",
        "tool": "create_work_item",
        "fields": {
            "project": {"state": "resolved", "value": "p-vanished", "confidence": 1.0},
            "title": {"state": "resolved", "value": "Login fails", "confidence": 1.0},
        },
    })
    assert await R.revalidate(db_session, ctx, gone) == ["project"]
