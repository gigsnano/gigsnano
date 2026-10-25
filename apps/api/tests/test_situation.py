"""GIN-312: the situation the Code Intelligence / GigsAI agent routes on must
report a connected repo when the thread is bound to a repo-connected project, and
must not imply a repo when the thread has no project (the false-disconnected bug)."""

import pytest

from gigsnano_api.agent.situation import build_situation
from gigsnano_api.models import ECloneStatus, Workspace


@pytest.mark.asyncio
async def test_situation_reports_connected_repo(db_session, make_project):
    proj = await make_project(
        repo_full_name="acme/web",
        indexed_commit_sha="f10c3ab0000000000000000000000000000000",
        clone_status=ECloneStatus.READY,
    )
    ws = await db_session.get(Workspace, proj.workspace_id)

    text = await build_situation(db_session, ws, proj.id, surface="gigs_ai")

    assert "Repo: connected (acme/web)" in text
    assert "not connected" not in text


@pytest.mark.asyncio
async def test_situation_without_project_never_claims_a_repo(db_session, make_project):
    # The GIN-312 bug: the Codebase "Ask" thread was created with no project_id, so
    # the agent saw "no project in scope" and hallucinated "no repository connected"
    # even though the project's repo was indexed. Guard the decision seam here.
    proj = await make_project(repo_full_name="acme/web")
    ws = await db_session.get(Workspace, proj.workspace_id)

    text = await build_situation(db_session, ws, None, surface="gigs_ai")

    assert "no project in scope" in text
    assert "connected" not in text
    assert "acme/web" not in text
