import pytest

from gigsnano_api.agent.situation import build_situation
from gigsnano_api.context_engine.graph import store
from gigsnano_api.context_engine.graph.model import CodeGraph, Node, node_id
from gigsnano_api.models import Artifact, ECloneStatus, EIndexStatus, Project


async def test_situation_reports_repo_and_docs(db_session, make_workspace):
    ws = await make_workspace()
    proj = Project(
        workspace_id=ws.id,
        name="Billing",
        identifier="BE",
        cover_image_url="x",
        repo_full_name="acme/billing",
        clone_status=ECloneStatus.READY,
        index_status=EIndexStatus.READY,
        indexed_commit_sha="a81fc27",
    )
    db_session.add(proj)
    await db_session.flush()
    db_session.add(Artifact(project_id=proj.id, doc_type="prd", title="PRD", content_md="x"))
    await db_session.commit()
    s = await build_situation(db_session, ws, proj.id, surface="gigs_ai")
    assert "Billing" in s and "acme/billing" in s and "prd" in s.lower()
    # No FalkorDB graph seeded here -> index cannot be reported ready hermetically.
    # See test_situation_index_ready below for the FalkorDB-gated "index ready" case.
    assert "index not ready" in s.lower()


async def test_situation_no_repo(db_session, make_workspace):
    ws = await make_workspace()
    proj = Project(workspace_id=ws.id, name="Fresh", identifier="FR", cover_image_url="x")
    db_session.add(proj)
    await db_session.commit()
    s = await build_situation(db_session, ws, proj.id, surface="gigs_ai")
    assert "no repo" in s.lower() or "not connected" in s.lower()


@pytest.mark.skipif(not store.available(), reason="FalkorDB not reachable")
async def test_situation_index_ready(db_session, make_workspace):
    ws = await make_workspace()
    proj = Project(
        workspace_id=ws.id,
        name="Billing",
        identifier="BE",
        cover_image_url="x",
        repo_full_name="acme/billing",
        clone_status=ECloneStatus.READY,
        index_status=EIndexStatus.READY,
        indexed_commit_sha="a81fc27",
    )
    db_session.add(proj)
    await db_session.commit()
    store.drop(proj.id)
    g = CodeGraph()
    g.add_node(Node(node_id("r", "svc.py", "save"), "save", "save", "svc.py", "function", "python", 1, 3))
    store.upsert_graph(proj.id, g)
    try:
        s = await build_situation(db_session, ws, proj.id, surface="gigs_ai")
        assert "index ready" in s.lower()
    finally:
        store.drop(proj.id)
