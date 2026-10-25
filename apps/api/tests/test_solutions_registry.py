from gigsnano_api.core.config import settings
from gigsnano_api.features.solutions.cohort import is_solutions_cohort


def test_cohort_enables_all_workspaces_when_allowlist_empty(monkeypatch):
    monkeypatch.setattr(settings, "solutions_enabled", True)
    monkeypatch.setattr(settings, "solution_workspace_allowlist", "")
    assert is_solutions_cohort("acme") is True
    assert is_solutions_cohort("any-other") is True

    monkeypatch.setattr(settings, "solutions_enabled", False)
    assert is_solutions_cohort("acme") is False


def test_cohort_requires_flag_and_allowlist(monkeypatch):
    monkeypatch.setattr(settings, "solutions_enabled", False)
    monkeypatch.setattr(settings, "solution_workspace_allowlist", "acme")
    assert is_solutions_cohort("acme") is False

    monkeypatch.setattr(settings, "solutions_enabled", True)
    monkeypatch.setattr(settings, "solution_workspace_allowlist", "acme,beta")
    assert is_solutions_cohort("acme") is True
    assert is_solutions_cohort("other") is False


def test_builtin_registry_validates_clean():
    from gigsnano_api.features.solutions.registry import validate_builtin_registry

    assert validate_builtin_registry() == []


def test_build_registry_shape_and_disabled_ra(monkeypatch):
    from gigsnano_api.features.solutions.registry import build_registry

    monkeypatch.setattr(settings, "solutions_enabled", True)
    monkeypatch.setattr(settings, "solution_workspace_allowlist", "acme")

    body = build_registry("acme")
    assert body.revision
    keys = {s.key: s for s in body.solutions}
    assert keys["software_delivery"].availability == "available"
    assert keys["revenue_assurance"].availability == "disabled"
    assert keys["revenue_assurance"].availability_reason
    assert (
        keys["revenue_assurance"].availability_reason
        == "Revenue Assurance is in limited pilot. Ask a workspace admin to request access."
    )


def test_build_registry_disabled_outside_cohort(monkeypatch):
    from gigsnano_api.features.solutions.registry import build_registry

    monkeypatch.setattr(settings, "solutions_enabled", False)

    body = build_registry("acme")
    assert all(s.availability == "disabled" for s in body.solutions)
    assert all(
        s.availability_reason == "Solutions are not enabled for this workspace."
        for s in body.solutions
    )
    # Software Delivery remains listable outside the cohort.
    assert any(s.key == "software_delivery" for s in body.solutions)


def test_build_registry_disabled_when_not_on_allowlist(monkeypatch):
    from gigsnano_api.features.solutions.registry import build_registry

    monkeypatch.setattr(settings, "solutions_enabled", True)
    monkeypatch.setattr(settings, "solution_workspace_allowlist", "acme")

    body = build_registry("other")
    assert all(s.availability == "disabled" for s in body.solutions)
    assert all(
        s.availability_reason == "Solutions are not enabled for this workspace."
        for s in body.solutions
    )


def test_setup_draft_model_and_project_columns():
    from gigsnano_api.models.projects import Project
    from gigsnano_api.models.solutions import DRAFT_TTL_DAYS, SETUP_DRAFT_STEP, SetupDraft

    assert SETUP_DRAFT_STEP == "setup"
    assert DRAFT_TTL_DAYS == 30
    assert SetupDraft.__tablename__ == "setup_drafts"
    assert "solution_key" in Project.__table__.c
    assert "solution_version" in Project.__table__.c
    assert Project.__table__.c.solution_key.nullable
    assert Project.__table__.c.solution_version.nullable


async def test_registry_shape_and_disabled_ra(client, monkeypatch):
    monkeypatch.setattr(settings, "solutions_enabled", True)
    monkeypatch.setattr(settings, "solution_workspace_allowlist", "acme")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    res = await client.get("/api/workspaces/acme/solutions/")
    assert res.status_code == 200
    body = res.json()
    assert body["revision"]
    keys = {s["key"]: s for s in body["solutions"]}
    assert keys["software_delivery"]["availability"] == "available"
    assert keys["revenue_assurance"]["availability"] == "disabled"
    assert keys["revenue_assurance"]["availability_reason"]


async def test_registry_disabled_outside_cohort(client, monkeypatch):
    monkeypatch.setattr(settings, "solutions_enabled", False)
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada2@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    body = (await client.get("/api/workspaces/acme/solutions/")).json()
    assert all(s["availability"] == "disabled" for s in body["solutions"])
    assert all(
        s["availability_reason"] == "Solutions are not enabled for this workspace."
        for s in body["solutions"]
    )
    assert any(s["key"] == "software_delivery" for s in body["solutions"])
