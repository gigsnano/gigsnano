"""Shared test helpers.

Extracted from per-file copies (sprint_zero/by_workflow) and from a sibling test
module (make_staff, previously imported from tests.test_admin_router). Import these
instead of re-defining them or reaching into another test file:

    from tests.helpers import sprint_zero, by_workflow, make_staff
"""
from sqlalchemy import select

from gigsnano_api.auth.models import User
from gigsnano_api.models import StaffMember, StaffRole
from gigsnano_api.models.code_artifacts import CodeArtifact, ECodeArtifactKind


async def seed_code_artifact(db_session, project_id, kind, data, commit_sha="deadbeef"):
    """Persist a code-intelligence artifact the way the index job would, so endpoint/
    tool tests read real rows (artifacts live in Postgres now, not on disk)."""
    if isinstance(kind, str):
        kind = ECodeArtifactKind(kind)
    db_session.add(
        CodeArtifact(project_id=project_id, kind=kind, data=data, commit_sha=commit_sha)
    )
    await db_session.commit()


async def make_staff(client, db_session, *, is_system=True, privileges=None):
    """Sign up a user and grant them staff. Returns the created StaffRole."""
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!"})
    user_id = (await db_session.execute(select(User))).scalars().first().id
    role = StaffRole(name="Superadmin" if is_system else "Support",
                     privileges=privileges or [], is_system=is_system)
    db_session.add(role)
    await db_session.flush()
    db_session.add(StaffMember(user_id=user_id, role_id=role.id, is_active=True))
    await db_session.commit()
    return role


async def sprint_zero(client, project_id):
    """The sprint-zero cards for a project (list — this endpoint is not paginated)."""
    return (
        await client.get(f"/api/workspaces/acme/projects/{project_id}/sprint-zero/stories/")
    ).json()


def by_workflow(stories, workflow):
    """Find the sprint-zero card driving `workflow`. Null-safe: skips non-BMAD stories."""
    return next(s for s in stories if s["bmad"] and s["bmad"]["workflow"] == workflow)
