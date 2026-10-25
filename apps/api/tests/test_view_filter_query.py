"""GIN-175: a View must not accept a filter nothing can honour.

`filter_query` was free text stored with `.strip()` and never validated, while the
client understood only three forms and returned EVERY item for anything else — so
a view named for a filter listed everything, silently.
"""

import pytest

from gigsnano_api.features.views.filter_query import validate_filter_query

CREATE_PROJECT = {
    "name": "Mobile App", "identifier": "MBA", "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


async def setup_project(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    return (await client.post("/api/workspaces/acme/projects/", json=CREATE_PROJECT)).json()


# --- the validator itself ---


def test_empty_query_is_valid_and_means_no_filter():
    assert validate_filter_query("") == ""
    assert validate_filter_query("   ") == ""
    assert validate_filter_query(None) == ""


@pytest.mark.parametrize(
    "query,expected",
    [
        ("status:in_progress", "status = in_progress"),
        ("cycle:cyc_1", "cycle = cyc_1"),
        ("assignee:me", "assignee = me"),
        ("priority:high", "priority = high"),
        ("  STATUS:done  ", "status = done"),  # normalized
        ("cycle:cyc:1", "cycle = cyc:1"),  # colons inside the value survive
    ],
)
def test_supported_queries_are_accepted_and_normalized(query, expected):
    assert validate_filter_query(query) == expected


@pytest.mark.parametrize(
    "query",
    [
        "sprint_zero:incomplete",  # the exact fixture that shipped and did nothing
        "workflow:bmad-prd",  # the create dialog used to suggest this
        "status:in-progress",  # typo'd enum
        "priority:critical",  # not a priority
        "garbage",  # no separator
        ":value",  # no field
        "status:",  # no value
    ],
)
def test_unhonourable_queries_are_rejected(query):
    with pytest.raises(ValueError):
        validate_filter_query(query)


def test_rejection_reason_names_the_field():
    with pytest.raises(ValueError, match="sprint_zero"):
        validate_filter_query("sprint_zero:incomplete")


def test_multi_term_and_is_accepted_and_normalized():
    assert (
        validate_filter_query("status:todo priority:high")
        == "status = todo AND priority = high"
    )
    assert (
        validate_filter_query("  STATUS:todo   assignee:me  ")
        == "status = todo AND assignee = me"
    )


def test_repeated_same_field_collapses_to_in():
    assert (
        validate_filter_query("status:todo status:in_progress")
        == "status in (todo, in_progress)"
    )
    assert (
        validate_filter_query("status:todo status:in_progress priority:high")
        == "status in (todo, in_progress) AND priority = high"
    )
    assert (
        validate_filter_query("assignee:me assignee:u1 label:lab_1 label:lab_2")
        == "assignee in (me, u1) AND label in (lab_1, lab_2)"
    )


def test_code_analysis_field_rejected_at_save_boundary():
    with pytest.raises(ValueError, match="severity"):
        validate_filter_query("severity = high")
    with pytest.raises(ValueError, match="severity"):
        validate_filter_query("severity:high")


@pytest.mark.parametrize(
    "query,expected",
    [
        ("title:login", "title ~ login"),
        ("label:lab_1", "label = lab_1"),
        ("due:2026-07-01", "dueDate = 2026-07-01"),
        (
            "due:2026-07-01..2026-07-31",
            "dueDate between 2026-07-01 and 2026-07-31",
        ),
        (
            "created:2026-01-01..2026-01-31",
            "createdAt between 2026-01-01 and 2026-01-31",
        ),
    ],
)
def test_new_gigsql_fields(query, expected):
    assert validate_filter_query(query) == expected


@pytest.mark.parametrize(
    "query",
    [
        "status:todo garbage",
        "due:not-a-date",
        "due:2026-07-01..bad",
        "title:",
    ],
)
def test_bad_multi_term_rejected(query):
    with pytest.raises(ValueError):
        validate_filter_query(query)


# --- through the API ---


async def test_creating_a_view_with_an_unsupported_filter_is_rejected(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await client.post(
        f"/api/workspaces/acme/projects/{pid}/views/",
        json={"name": "Sprint-0 blockers", "layout": "table", "filter_query": "sprint_zero:incomplete"},
    )
    # 422, not a stored view that shows everything.
    assert res.status_code == 422


async def test_creating_a_view_with_code_analysis_filter_is_rejected(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await client.post(
        f"/api/workspaces/acme/projects/{pid}/views/",
        json={"name": "High severity", "layout": "list", "filter_query": "severity = high"},
    )
    assert res.status_code == 422


async def test_creating_a_view_with_a_supported_filter_works(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await client.post(
        f"/api/workspaces/acme/projects/{pid}/views/",
        json={"name": "In progress", "layout": "list", "filter_query": "status:in_progress"},
    )
    assert res.status_code == 201
    assert res.json()["filter_query"] == "status = in_progress"


async def test_creating_a_view_with_multi_term_gigsql_works(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await client.post(
        f"/api/workspaces/acme/projects/{pid}/views/",
        json={
            "name": "Todo high",
            "layout": "list",
            "filter_query": "status:todo priority:high",
        },
    )
    assert res.status_code == 201
    assert res.json()["filter_query"] == "status = todo AND priority = high"


async def test_a_view_with_no_filter_is_still_allowed(client):
    project = await setup_project(client)
    pid = project["id"]
    res = await client.post(
        f"/api/workspaces/acme/projects/{pid}/views/",
        json={"name": "Everything", "layout": "list"},
    )
    assert res.status_code == 201
    assert res.json()["filter_query"] == ""


async def test_updating_a_view_to_an_unsupported_filter_is_rejected(client):
    project = await setup_project(client)
    pid = project["id"]
    view = (
        await client.post(
            f"/api/workspaces/acme/projects/{pid}/views/",
            json={"name": "Mine", "layout": "list", "filter_query": "assignee:me"},
        )
    ).json()

    res = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/views/{view['id']}/",
        json={"filter_query": "nonsense:x"},
    )
    assert res.status_code == 422

    # The good query must survive the rejected edit.
    after = (await client.get(f"/api/workspaces/acme/projects/{pid}/views/")).json()
    assert after[0]["filter_query"] == "assignee = me"


async def test_workspace_views_validate_too(client):
    await setup_project(client)
    res = await client.post(
        "/api/workspaces/acme/workspace-views/",
        json={"name": "Bad", "layout": "list", "filter_query": "sprint_zero:incomplete"},
    )
    assert res.status_code == 422
