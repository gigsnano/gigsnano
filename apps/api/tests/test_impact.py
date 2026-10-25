import subprocess
from pathlib import Path

from gigsnano_api.features.stories import impact as impact_svc
from gigsnano_api.models.stories import EStoryRelationType, Story, StoryRelation


def test_risk_band_bands():
    assert impact_svc.risk_band(0, 0)["level"] == "low"
    assert impact_svc.risk_band(1, 0)["level"] == "low"  # 3
    assert impact_svc.risk_band(4, 0)["level"] == "medium"  # 12
    assert impact_svc.risk_band(8, 2)["level"] == "high"  # 24 + 10 = 34


def test_affected_files_none_repo():
    assert impact_svc.affected_files(None, "WEB-1") == []
    assert impact_svc.affected_files(Path("/no/such/dir"), "WEB-1") == []


def test_affected_files_from_commit_messages(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()

    def git(*args):
        subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True)

    git("init", "-q")
    git("config", "user.email", "t@t.test")
    git("config", "user.name", "t")
    (repo / "a.py").write_text("x = 1\n")
    (repo / "readme.md").write_text("# doc\n")  # not a source file -> excluded
    git("add", "-A")
    git("commit", "-qm", "WEB-1 add a")
    (repo / "b.py").write_text("y = 2\n")
    git("add", "-A")
    git("commit", "-qm", "unrelated change")

    files = impact_svc.affected_files(repo, "WEB-1")
    assert "a.py" in files
    assert "b.py" not in files  # different commit, no code ref
    assert "readme.md" not in files  # not a source file


async def _story(db, project, number, title, **kw):
    s = Story(project_id=project.id, title=title, story_number=number, **kw)
    db.add(s)
    await db.flush()
    return s


async def test_related_items_from_relation(db_session, make_project):
    project = await make_project(identifier="WEB")
    a = await _story(db_session, project, 1, "Story A")
    b = await _story(db_session, project, 2, "Story B")
    db_session.add(
        StoryRelation(story_id=a.id, related_story_id=b.id, relation_type=EStoryRelationType.BLOCKING)
    )
    await db_session.flush()

    result = await impact_svc.compute_impact(db_session, project, a)
    related = {r["code"]: r["reason"] for r in result["related_items"]}
    assert related.get("WEB-2") == "blocking"
    assert result["story_code"] == "WEB-1"
    # a citation exists for the related item
    assert {"type": "item", "ref": "WEB-2"} in result["citations"]


async def test_related_items_from_shared_module(db_session, make_project):
    project = await make_project(identifier="WEB")
    a = await _story(db_session, project, 1, "Story A", module_id="mod-1")
    await _story(db_session, project, 2, "Story B", module_id="mod-1")
    await _story(db_session, project, 3, "Story C", module_id="mod-2")  # different module

    result = await impact_svc.compute_impact(db_session, project, a)
    related = {r["code"]: r["reason"] for r in result["related_items"]}
    assert related.get("WEB-2") == "same module"
    assert "WEB-3" not in related


async def test_impact_endpoint_e2e(app, client):
    await client.post(
        "/api/auth/sign-up/",
        json={"display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"},
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    p = (
        await client.post(
            "/api/workspaces/acme/projects/",
            json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                  "cover_image_url": "https://img.test/c.jpg"},
        )
    ).json()
    s = (
        await client.post(
            f"/api/workspaces/acme/projects/{p['id']}/stories/", json={"title": "Task A"}
        )
    ).json()

    res = await client.get(
        f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/impact/"
    )
    assert res.status_code == 200
    body = res.json()
    assert body["story_code"].startswith("WEB-")
    assert body["risk"]["level"] == "low"  # no clone, no relations
    assert body["affected_files"] == []
    assert body["related_items"] == []


def test_estimate_points_scales():
    assert impact_svc.estimate_points(0, 0, 0)["points"] == 1
    small = impact_svc.estimate_points(1, 0, 0)["points"]
    big = impact_svc.estimate_points(6, 3, 1200)["points"]
    assert big > small
    assert big in (13, 21)


def test_referenced_codes_only_this_project():
    got = impact_svc._referenced_codes("WEB", "blocked by WEB-5, relates WEB-12 and GIN-9")
    assert got == {5, 12}  # GIN-9 is another project's identifier


async def test_compute_estimate_endpoint_shape(db_session, make_project):
    project = await make_project(identifier="WEB")
    a = await _story(db_session, project, 1, "Story A")
    out = await impact_svc.compute_estimate(db_session, project, a)
    assert out["story_code"] == "WEB-1"
    assert out["points"] >= 1
    assert "description" in out["rationale"]


async def test_suggested_dependencies_from_description(db_session, make_project):
    project = await make_project(identifier="WEB")
    await _story(db_session, project, 2, "Story B")
    a = await _story(db_session, project, 1, "Story A", description="depends on WEB-2 for the API")

    suggestions = await impact_svc.suggested_dependencies(db_session, project, a)
    by_code = {s["code"]: s for s in suggestions}
    assert "WEB-2" in by_code
    assert by_code["WEB-2"]["evidence"] == "referenced in description"
    assert by_code["WEB-2"]["confidence"] == "high"


async def test_suggested_dependencies_skips_already_linked(db_session, make_project):
    project = await make_project(identifier="WEB")
    b = await _story(db_session, project, 2, "Story B")
    a = await _story(db_session, project, 1, "Story A", description="depends on WEB-2")
    db_session.add(
        StoryRelation(story_id=a.id, related_story_id=b.id, relation_type=EStoryRelationType.RELATES_TO)
    )
    await db_session.flush()

    suggestions = await impact_svc.suggested_dependencies(db_session, project, a)
    assert "WEB-2" not in {s["code"] for s in suggestions}
