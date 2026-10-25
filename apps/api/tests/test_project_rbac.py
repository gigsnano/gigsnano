"""GIN-318/319/322/323: project RBAC matrix, migration dry-run and enforcement."""

from gigsnano_api.models import EProjectRole, EWorkspaceRole
from gigsnano_api.shared.project_rbac import (
    ROLE_PERMISSIONS,
    EProjectPermission,
    can,
    has_project_permission,
)
from tests.test_project_members import setup

P = "/api/workspaces/acme/projects"


# ─────────────────────────── matrix (pure) ───────────────────────────

def test_roles_are_strict_capability_supersets():
    p = ROLE_PERMISSIONS
    assert p[EProjectRole.VIEWER] < p[EProjectRole.MEMBER] < p[EProjectRole.ADMIN] < p[EProjectRole.OWNER]


def test_member_delivers_but_cannot_administer():
    assert has_project_permission(EProjectRole.MEMBER, EProjectPermission.DELIVER)
    assert not has_project_permission(EProjectRole.MEMBER, EProjectPermission.MANAGE_SETTINGS)
    assert not has_project_permission(EProjectRole.MEMBER, EProjectPermission.MANAGE_MEMBERS)


def test_only_owner_transfers_or_deletes():
    for perm in (EProjectPermission.TRANSFER_OWNERSHIP, EProjectPermission.DELETE_PROJECT):
        assert has_project_permission(EProjectRole.OWNER, perm)
        assert not has_project_permission(EProjectRole.ADMIN, perm)


def test_viewer_is_read_only():
    assert has_project_permission(EProjectRole.VIEWER, EProjectPermission.VIEW)
    assert not has_project_permission(EProjectRole.VIEWER, EProjectPermission.DELIVER)


def test_workspace_governance_overrides_project_role():
    # workspace Owner/Admin get full project authority even with no project role
    assert can(EWorkspaceRole.ADMIN, None, EProjectPermission.DELETE_PROJECT)
    assert can(EWorkspaceRole.OWNER, None, EProjectPermission.MANAGE_SETTINGS)
    # a plain workspace member with no project role gets nothing
    assert not can(EWorkspaceRole.MEMBER, None, EProjectPermission.VIEW)


# ─────────────────────── migration dry-run ───────────────────────

async def test_owner_migration_dry_run_classifies_projects(db_session, make_project, make_user):
    from gigsnano_api.features.projects.rbac_migration import owner_migration_dry_run

    lead = make_user(email="lead@example.test")
    db_session.add(lead)
    await db_session.flush()
    await make_project(lead_id=lead.id)   # has a lead, no member row → resolved/insert
    await make_project(lead_id=None)      # no lead, no owner → ownerless

    report = await owner_migration_dry_run(db_session)
    assert report["total_projects"] >= 2
    assert any(r["lead_id"] == lead.id and r["action"] == "insert" for r in report["resolved"])
    assert len(report["ownerless"]) >= 1


# ─────────────────────── enforcement (E2E) ───────────────────────

async def _add_member(client, project_id, user_id, role="member"):
    return (
        await client.post(
            f"{P}/{project_id}/members/", json={"user_id": user_id, "role": role}
        )
    ).json()


async def _signin(client, email):
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={"email": email, "password": "s3cret!"})


async def test_member_cannot_administer_but_can_deliver(client):
    # GIN-323: a project MEMBER is blocked from project config server-side, but can
    # still deliver work — hiding controls is not the only protection.
    project, alan_ws = await setup(client)
    await _add_member(client, project["id"], alan_ws["user_id"], role="member")
    await _signin(client, "alan@example.test")

    # config is denied
    assert (await client.patch(f"{P}/{project['id']}/", json={"name": "Hijacked"})).status_code == 403
    assert (
        await client.post(f"{P}/{project['id']}/labels/", json={"name": "x", "color": "#fff"})
    ).status_code == 403
    assert (await client.delete(f"{P}/{project['id']}/")).status_code == 403
    # member management is denied
    assert (
        await client.post(f"{P}/{project['id']}/members/", json={"user_id": alan_ws["user_id"]})
    ).status_code == 403
    # delivery still works
    assert (
        await client.post(f"{P}/{project['id']}/stories/", json={"title": "Alan's task"})
    ).status_code == 201


async def test_project_admin_can_manage_settings(client):
    project, alan_ws = await setup(client)
    await _add_member(client, project["id"], alan_ws["user_id"], role="admin")
    await _signin(client, "alan@example.test")
    # admin may configure the project (MANAGE_SETTINGS)
    assert (
        await client.post(f"{P}/{project['id']}/labels/", json={"name": "ok", "color": "#111"})
    ).status_code == 201
    # ...but not delete it (owner-only)
    assert (await client.delete(f"{P}/{project['id']}/")).status_code == 403


async def test_last_owner_cannot_be_demoted_or_removed(client):
    # Ada creates the project → she is the project OWNER (sole owner).
    project, _ = await setup(client)
    members = (await client.get(f"{P}/{project['id']}/members/")).json()
    ada = next(m for m in members if m["role"] == "owner")

    demote = await client.patch(
        f"{P}/{project['id']}/members/{ada['id']}/", json={"role": "admin"}
    )
    assert demote.status_code == 409
    remove = await client.delete(f"{P}/{project['id']}/members/{ada['id']}/")
    assert remove.status_code == 409


async def test_transfer_ownership_is_atomic(client):
    project, alan_ws = await setup(client)
    await _add_member(client, project["id"], alan_ws["user_id"], role="member")

    res = await client.post(
        f"{P}/{project['id']}/transfer-ownership/",
        json={"new_owner_user_id": alan_ws["user_id"]},
    )
    assert res.status_code == 200
    assert res.json()["role"] == "owner"

    members = (await client.get(f"{P}/{project['id']}/members/")).json()
    owners = [m for m in members if m["role"] == "owner"]
    assert len(owners) == 1 and owners[0]["user_id"] == alan_ws["user_id"]  # never zero owners
