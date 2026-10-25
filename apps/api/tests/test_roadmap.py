"""GIN-206/207/208/211 — AI Roadmap E2E: draft initiatives from the brief, create
an initiative + milestone, link work items, watch progress + slip roll up, and cut
a release with an agent-written changelog from shipped items. FakeProvider scripts
the drafts.
"""

from datetime import date, timedelta

from sqlalchemy import select

from gigsnano_api.bmad.provider import FakeProvider
from gigsnano_api.features.roadmap import service as S
from gigsnano_api.models import Artifact, EArtifactStatus
from gigsnano_api.models.roadmap import Initiative
from gigsnano_api.models.workspace import Workspace


def test_slip_band():
    today = date(2026, 7, 18)
    assert S.slip_band(0, 0, None, today)[0] == "on_track"          # nothing linked
    assert S.slip_band(5, 5, today, today)[0] == "on_track"          # all done
    assert S.slip_band(5, 0, today - timedelta(days=1), today)[0] == "off_track"   # overdue
    assert S.slip_band(5, 0, today + timedelta(days=2), today)[0] == "at_risk"     # 5 open, 2d
    assert S.slip_band(2, 0, today + timedelta(days=30), today)[0] == "on_track"


async def _setup(client, db_session):
    await client.post("/api/auth/sign-up/",
                      json={"display_name": "Ada", "email": "a@t.test", "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    pid = (await client.post("/api/workspaces/acme/projects/",
                             json={"name": "Web", "identifier": "WEB", "flow": "fresh",
                                   "cover_image_url": "https://img.test/c.jpg"})).json()["id"]
    db_session.add(Artifact(project_id=pid, doc_type="brief", title="Brief",
                            content_md="Build a payments platform for SMBs.",
                            version=1, status=EArtifactStatus.FINAL))
    await db_session.commit()
    return pid


async def _story(client, pid, title):
    return (await client.post(f"/api/workspaces/acme/projects/{pid}/stories/",
                              json={"title": title})).json()["id"]


async def test_roadmap_end_to_end(app, client, db_session):
    pid = await _setup(client, db_session)

    # Draft initiatives from the FINAL brief (no text override → reads the artifact).
    app.state.llm_provider = FakeProvider(extractions=[
        {"initiatives": [{"title": "Payments core", "description": "..."}]}])
    drafted = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/roadmap/draft-initiatives/", json={})).json()
    assert drafted["initiatives"][0]["title"] == "Payments core"

    # Save an initiative + a milestone under it (target far out → on_track).
    init = (await client.post("/api/workspaces/acme/initiatives/",
                              json={"title": "Payments core"})).json()
    target = str(date.today() + timedelta(days=30))
    ms = (await client.post(f"/api/workspaces/acme/projects/{pid}/milestones/",
                            json={"name": "MVP", "initiative_id": init["id"], "target_date": target})).json()
    mid = ms["id"]

    # Two work items; ship one; link both to the milestone.
    s1, s2 = await _story(client, pid, "Card checkout"), await _story(client, pid, "Refunds")
    await client.patch(f"/api/workspaces/acme/projects/{pid}/stories/{s1}/", json={"status": "done"})
    linked = (await client.post(f"/api/workspaces/acme/projects/{pid}/milestones/{mid}/link/",
                                json={"story_ids": [s1, s2]})).json()
    assert linked["rollup"]["total"] == 2
    assert linked["rollup"]["done"] == 1
    assert linked["rollup"]["progress_pct"] == 50
    assert linked["rollup"]["slip_signal"] == "on_track"

    # Initiative rolls up its milestones' items cross-project.
    roll = (await client.get(f"/api/workspaces/acme/initiatives/{init['id']}/rollup/")).json()
    assert roll["total"] == 2 and roll["done"] == 1

    # Cut a release: link the shipped item, generate the changelog from it.
    rel = (await client.post(f"/api/workspaces/acme/projects/{pid}/releases/",
                             json={"version": "v1.0.0"})).json()
    await client.post(f"/api/workspaces/acme/projects/{pid}/releases/{rel['id']}/link/",
                      json={"story_ids": [s1]})
    app.state.llm_provider = FakeProvider(extractions=[{"markdown": "## v1.0.0\n- Card checkout"}])
    cut = (await client.post(
        f"/api/workspaces/acme/projects/{pid}/releases/{rel['id']}/changelog/")).json()
    assert "Card checkout" in cut["changelog_md"]

    # Mark it released → released_at stamped.
    released = (await client.patch(f"/api/workspaces/acme/projects/{pid}/releases/{rel['id']}/",
                                   json={"status": "released"})).json()
    assert released["released_at"] is not None


async def test_changelog_requires_shipped_items(app, client, db_session):
    pid = await _setup(client, db_session)
    rel = (await client.post(f"/api/workspaces/acme/projects/{pid}/releases/",
                             json={"version": "v0.1"})).json()
    # No linked done items → 400, not an empty LLM call.
    r = await client.post(f"/api/workspaces/acme/projects/{pid}/releases/{rel['id']}/changelog/")
    assert r.status_code == 400
