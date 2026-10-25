import httpx
import pytest

from gigsnano_api.sync.github_issues import fetch_issues, map_issue

OPEN_ISSUE = {
    "number": 1,
    "title": "Fix login bug",
    "body": "**Steps**\n- click login\n- crash",
    "state": "open",
    "labels": [{"name": "bug"}],
    "assignee": {"login": "octocat"},
    "html_url": "https://github.com/acme/widgets/issues/1",
}
CLOSED_ISSUE = {
    "number": 2,
    "title": "Old task",
    "body": "",
    "state": "closed",
    "labels": [],
    "assignee": None,
    "html_url": "https://github.com/acme/widgets/issues/2",
}
A_PULL_REQUEST = {
    "number": 3,
    "title": "Bump deps",
    "state": "open",
    "pull_request": {"url": "https://api.github.com/repos/acme/widgets/pulls/3"},
    "labels": [],
    "assignee": None,
    "html_url": "https://github.com/acme/widgets/pull/3",
}


def test_map_issue_open_vs_closed_and_fields():
    mapped = map_issue(OPEN_ISSUE)
    assert mapped == {
        "number": 1,
        "title": "Fix login bug",
        "body_markdown": OPEN_ISSUE["body"],
        "is_closed": False,
        "labels": ["bug"],
        "assignee_login": "octocat",
        "html_url": "https://github.com/acme/widgets/issues/1",
    }
    assert map_issue(CLOSED_ISSUE)["is_closed"] is True
    assert map_issue(CLOSED_ISSUE)["labels"] == []
    assert map_issue(CLOSED_ISSUE)["assignee_login"] is None


async def test_fetch_issues_excludes_pull_requests():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[OPEN_ISSUE, CLOSED_ISSUE, A_PULL_REQUEST])

    transport = httpx.MockTransport(handler)
    issues = await fetch_issues("tok", "acme", "widgets", transport=transport)
    assert [i["number"] for i in issues] == [1, 2]


async def sign_up_and_create_ws(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def connect_github(client) -> None:
    install = (await client.get("/api/workspaces/acme/github/install-url/")).json()
    state = install["url"].split("state=")[1].split("&")[0]
    res = await client.post(
        "/api/workspaces/acme/github/oauth/callback/", json={"code": "fake-code", "state": state}
    )
    assert res.status_code == 200


async def create_project(client) -> dict:
    res = await client.post(
        "/api/workspaces/acme/projects/",
        json={
            "name": "Widgets", "identifier": "WID", "flow": "fresh",
            "cover_image_url": "https://img.test/c.jpg",
        },
    )
    assert res.status_code == 201
    return res.json()


@pytest.fixture(autouse=True)
def _fake_fetch_issues(monkeypatch):
    """Router preview + service background task both import `fetch_issues`
    directly — patch both local bindings so the test never hits the network."""
    async def fake(token, owner, repo, **kwargs):
        assert token == "fake-oauth-token"  # FakeGitHubOAuth's canned exchange result
        # Replicates fetch_issues' own PR-filtering so this stub matches production
        # behavior instead of silently inflating counts.
        return [
            i for i in (OPEN_ISSUE, CLOSED_ISSUE, A_PULL_REQUEST) if "pull_request" not in i
        ]

    monkeypatch.setattr(
        "gigsnano_api.features.importers.router.fetch_issues", fake
    )
    monkeypatch.setattr(
        "gigsnano_api.features.importers.service.fetch_issues", fake
    )


async def test_preview_returns_counts_without_persisting(client):
    await sign_up_and_create_ws(client)
    await connect_github(client)
    res = await client.get(
        "/api/workspaces/acme/imports/github/preview/",
        params={"owner": "acme", "repo": "widgets"},
    )
    assert res.status_code == 200
    assert res.json() == {"issue_count": 2, "label_count": 1, "assignee_count": 1}


async def test_create_import_maps_issues_to_stories(client):
    await sign_up_and_create_ws(client)
    await connect_github(client)
    project = await create_project(client)

    res = await client.post(
        "/api/workspaces/acme/imports/github/",
        json={"owner": "acme", "repo": "widgets", "project_id": project["id"]},
    )
    assert res.status_code == 201
    job = res.json()
    assert job["status"] == "queued"

    got = (await client.get(f"/api/workspaces/acme/imports/{job['id']}/")).json()
    assert got["status"] == "completed"
    assert got["summary"]["issues_created"] == 2
    assert got["summary"]["issues_skipped"] == 0
    assert got["summary"]["labels_created"] == 1
    assert got["summary"]["unassigned_logins"] == ["octocat"]

    # Creating a project auto-seeds Sprint-0 BMAD cards (CLAUDE.md) alongside the
    # imported issues, so assert the imported titles are a subset, not the whole list.
    stories = (
        await client.get(f"/api/workspaces/acme/projects/{project['id']}/stories/")
    ).json()
    by_title = {s["title"]: s for s in stories["items"]}
    assert by_title["Fix login bug"]["status"] == "todo"
    assert by_title["Old task"]["status"] == "done"


async def test_rerun_dedupes_via_imported_entity_ref(client):
    await sign_up_and_create_ws(client)
    await connect_github(client)
    project = await create_project(client)

    first = (
        await client.post(
            "/api/workspaces/acme/imports/github/",
            json={"owner": "acme", "repo": "widgets", "project_id": project["id"]},
        )
    ).json()

    # simulate a re-import: same job model, new job row, same connector inputs
    second = (
        await client.post(
            "/api/workspaces/acme/imports/github/",
            json={"owner": "acme", "repo": "widgets", "project_id": project["id"]},
        )
    ).json()
    got = (await client.get(f"/api/workspaces/acme/imports/{second['id']}/")).json()
    assert got["summary"]["issues_created"] == 0
    assert got["summary"]["issues_skipped"] == 2
    assert first["id"] != second["id"]
    assert "already imported" in " ".join(got["summary"]["notes"])


async def test_not_connected_is_409(client):
    await sign_up_and_create_ws(client)
    res = await client.get(
        "/api/workspaces/acme/imports/github/preview/",
        params={"owner": "acme", "repo": "widgets"},
    )
    assert res.status_code == 409


async def test_non_admin_gets_403(client):
    await sign_up_and_create_ws(client)
    alan = (await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })).json()
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "ada@example.test", "password": "s3cret!"}
    )
    await client.post("/api/workspaces/acme/members/", json={"user_id": alan["id"]})
    await client.post("/api/auth/sign-out/")
    await client.post(
        "/api/auth/sign-in/", json={"email": "alan@example.test", "password": "s3cret!"}
    )
    res = await client.get(
        "/api/workspaces/acme/imports/github/preview/",
        params={"owner": "acme", "repo": "widgets"},
    )
    assert res.status_code == 403
