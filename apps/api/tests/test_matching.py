from gigsnano_api.features.task_router.matcher import match_candidates
from gigsnano_api.models.stories import Story
from gigsnano_api.models.talent import Freelancer


def _freelancer(name, skills, success=90, rate=50, avail=True):
    return Freelancer(
        name=name, title="Dev", country="US", city="NYC", hourly_rate=rate,
        job_success_pct=success, total_earned_label="$10k", jobs_count=5, hours_worked=100,
        available_now=avail, skills=skills, hours_per_week_label="40", member_since="2020",
    )


async def test_match_ranks_agent_and_relevant_human_first(db_session, make_project):
    project = await make_project()
    story = Story(project_id=project.id, title="Add invoice payment ledger", story_number=1)
    db_session.add(story)
    db_session.add_all([
        _freelancer("Fin Pro", ["Finance", "Payments", "PCI"]),
        _freelancer("Generalist", ["Marketing"], success=50),
    ])
    await db_session.flush()

    cands = await match_candidates(db_session, project.workspace_id, story)

    # the router's finance expert is offered as an AI candidate
    assert any(c["type"] == "agent" and c["id"] == "persona:gigs-finance-expert" for c in cands)
    # the finance freelancer outranks the generalist (skill overlap with the task)
    by_name = {c["name"]: c for c in cands if c["type"] == "human"}
    assert by_name["Fin Pro"]["score"] > by_name["Generalist"]["score"]
    assert "Finance" in by_name["Fin Pro"]["reason"] or "finance" in by_name["Fin Pro"]["reason"].lower()
    assert by_name["Fin Pro"]["est_rate"] == 50


async def test_match_endpoint(app, client, db_session):


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
            f"/api/workspaces/acme/projects/{p['id']}/stories/",
            json={"title": "Build the checkout cart"},
        )
    ).json()
    db_session.add(_freelancer("Shop Dev", ["ecommerce", "checkout"]))
    await db_session.commit()

    res = await client.get(f"/api/workspaces/acme/projects/{p['id']}/stories/{s['id']}/match/")
    assert res.status_code == 200
    cands = res.json()
    assert any(c["type"] == "agent" for c in cands)
    assert any(c["type"] == "human" for c in cands)
