"""GIN-429 — pure Delivery-plan projection tests (Epic→Story→Task tree)."""

from gigsnano_api.features.journey.delivery import build_delivery_plan, _outcome
from gigsnano_api.models import Story


def _s(sid, title, *, description="", assignee_id=None):
    return Story(id=sid, title=title, description=description, assignee_id=assignee_id)


def test_builds_nested_tree_with_owner_resolution():
    epic = _s("e1", "Onboarding")
    story = _s("s1", "Sign up", description="A user can register.", assignee_id="u1")
    task = _s("t1", "POST /auth/register", assignee_id="u2")
    unowned = _s("t2", "KYC connector")  # no assignee

    plan = build_delivery_plan(
        epics=[epic],
        children_by_parent={"e1": [story], "s1": [task, unowned]},
        owner_by_id={"u1": "Web Team", "u2": "Platform Team"},
    )

    assert len(plan.epics) == 1
    e = plan.epics[0]
    assert e.title == "Onboarding" and len(e.stories) == 1
    s = e.stories[0]
    assert s.outcome == "A user can register."
    assert [t.title for t in s.tasks] == ["POST /auth/register", "KYC connector"]
    assert s.tasks[0].owner == "Platform Team"
    assert s.tasks[1].owner is None  # unowned task


def test_outcome_strips_html_and_truncates():
    assert _outcome("<p>Hello <b>world</b></p>") == "Hello world"
    assert len(_outcome("x " * 200)) <= 160


def test_empty_when_no_epics():
    assert build_delivery_plan([], {}, {}).epics == []
