import json
import os

import pytest

from gigsnano_api.agent.tools.base import ToolContext
from gigsnano_api.agent.tools.code import build_code_tools_registry
from gigsnano_api.models import ECloneStatus, ECodeArtifactKind, EIndexStatus, Project, Workspace
from gigsnano_api.workspace.paths import ensure_workspace
from tests.helpers import seed_code_artifact


async def _ready_project(db):
    ws = Workspace(name="WS", slug="ws")
    db.add(ws)
    await db.commit()
    proj = Project(
        workspace_id=ws.id,
        name="P",
        identifier="P1",
        cover_image_url="https://img.test/c.jpg",
        flow="existing",
        clone_status=ECloneStatus.READY,
        index_status=EIndexStatus.READY,
    )
    db.add(proj)
    await db.commit()
    root = ensure_workspace(proj.id)
    (root / "auth.py").write_text("def login(user):\n    return check(user)\n")
    await seed_code_artifact(
        db,
        proj.id,
        ECodeArtifactKind.GRAPH,
        {
            "nodes": [
                {"id": "auth.py:login", "label": "login", "source_file": "auth.py", "kind": "function"}
            ],
            "edges": [],
        },
    )
    return ws, proj


async def test_read_file_returns_contents(db_session):
    ws, proj = await _ready_project(db_session)
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("read_file").handler(ctx, {"project_id": proj.id, "path": "auth.py"})
    assert not res.is_error
    assert "def login" in res.content


async def test_read_file_rejects_path_escape(db_session):
    ws, proj = await _ready_project(db_session)
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("read_file").handler(
        ctx, {"project_id": proj.id, "path": "../../etc/passwd"}
    )
    assert res.is_error


async def test_code_grep_finds_matches(db_session):
    ws, proj = await _ready_project(db_session)
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("code_grep").handler(ctx, {"project_id": proj.id, "pattern": "login"})
    assert not res.is_error and "auth.py" in res.content


async def test_code_graph_query_returns_matching_nodes(db_session):
    ws, proj = await _ready_project(db_session)
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("code_graph_query").handler(ctx, {"project_id": proj.id, "query": "login"})
    assert not res.is_error and "login" in res.content


async def test_tools_error_when_project_not_in_workspace(db_session):
    ws, proj = await _ready_project(db_session)
    other = Workspace(name="Other", slug="other")
    db_session.add(other)
    await db_session.commit()
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=other, user=None, role="owner")
    res = await reg.get("read_file").handler(ctx, {"project_id": proj.id, "path": "auth.py"})
    assert res.is_error


async def test_code_grep_does_not_follow_symlink_escape(db_session, tmp_path):
    ws, proj = await _ready_project(db_session)
    root = ensure_workspace(proj.id)
    outside = tmp_path / "outside_secret.py"
    outside.write_text("SECRET = 'do-not-leak'\n")
    link = root / "leak.py"
    try:
        os.symlink(outside, link)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks not supported on this OS/user")
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("code_grep").handler(ctx, {"project_id": proj.id, "pattern": "SECRET"})
    # The reply echoes the pattern ("No matches for 'SECRET'"), so check the
    # file's contents and name never appear, not the bare word.
    assert "do-not-leak" not in res.content
    assert "leak.py" not in res.content


async def test_read_file_rejects_absolute_path(db_session, tmp_path):
    ws, proj = await _ready_project(db_session)
    outside = tmp_path / "outside_secret.py"
    outside.write_text("SECRET = 'do-not-leak'\n")
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("read_file").handler(ctx, {"project_id": proj.id, "path": str(outside)})
    assert res.is_error


async def test_er_schema_returns_er_json_for_ready_project(db_session):
    ws, proj = await _ready_project(db_session)
    await seed_code_artifact(
        db_session,
        proj.id,
        ECodeArtifactKind.ER,
        {"tables": [{"name": "users", "columns": []}], "relations": []},
    )
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("er_schema").handler(ctx, {"project_id": proj.id})
    assert not res.is_error
    assert "users" in res.content


async def test_er_schema_returns_empty_when_no_er_json(db_session):
    ws, proj = await _ready_project(db_session)
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("er_schema").handler(ctx, {"project_id": proj.id})
    assert not res.is_error
    assert json.loads(res.content) == {"tables": [], "relations": []}


async def test_code_metrics_returns_metrics_json_for_ready_project(db_session):
    ws, proj = await _ready_project(db_session)
    await seed_code_artifact(
        db_session,
        proj.id,
        ECodeArtifactKind.METRICS,
        {
            "totals": {"files": 1, "loc": 2},
            "languages": [{"name": "Python", "loc": 2}],
            "complexity": {"buckets": [], "worst": []},
            "duplication": {"percent": 0.0},
            "hotspots": [],
            "dependencies": {"cycles": []},
        },
    )
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("code_metrics").handler(ctx, {"project_id": proj.id})
    assert not res.is_error
    assert "Python" in res.content


async def test_code_metrics_errors_when_index_not_ready(db_session):
    ws = Workspace(name="WS3", slug="ws3")
    db_session.add(ws)
    await db_session.commit()
    proj = Project(
        workspace_id=ws.id,
        name="P3",
        identifier="P3",
        cover_image_url="https://img.test/c.jpg",
        flow="existing",
        clone_status=ECloneStatus.READY,
        index_status=EIndexStatus.PENDING,
    )
    db_session.add(proj)
    await db_session.commit()
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("code_metrics").handler(ctx, {"project_id": proj.id})
    assert res.is_error


async def test_er_schema_errors_when_index_not_ready(db_session):
    ws = Workspace(name="WS2", slug="ws2")
    db_session.add(ws)
    await db_session.commit()
    proj = Project(
        workspace_id=ws.id,
        name="P2",
        identifier="P2",
        cover_image_url="https://img.test/c.jpg",
        flow="existing",
        clone_status=ECloneStatus.READY,
        index_status=EIndexStatus.PENDING,
    )
    db_session.add(proj)
    await db_session.commit()
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("er_schema").handler(ctx, {"project_id": proj.id})
    assert res.is_error


async def test_load_project_falls_back_to_ctx_project(db_session):
    # The model passes an empty / unknown project_id, but the surface's project
    # is on the ToolContext — the tool resolves to it instead of erroring.
    ws, proj = await _ready_project(db_session)
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner", project_id=proj.id)
    empty = await reg.get("read_file").handler(ctx, {"project_id": "", "path": "auth.py"})
    assert not empty.is_error and "def login" in empty.content
    wrong = await reg.get("read_file").handler(ctx, {"project_id": "nope", "path": "auth.py"})
    assert not wrong.is_error and "def login" in wrong.content


async def test_load_project_rejects_a_non_member_in_the_same_workspace(
    db_session, make_user
):
    """A plain workspace member with no ProjectMember row on THIS project must be
    refused exactly like an unknown/other-workspace project id -- same gap that
    was fixed in health.py::_scoped_project / spend.py::_scope. Workspace match
    alone used to be enough for _load_project to hand back the project, which let
    any workspace member read a repo/code context they have no membership on. A
    different-workspace user (test_tools_error_when_project_not_in_workspace,
    above) is a vacuous check for this bug -- the old code already refused that."""
    ws, proj = await _ready_project(db_session)
    user = make_user()
    db_session.add(user)
    await db_session.commit()

    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=user, role="member", project_id=proj.id)
    res = await reg.get("read_file").handler(ctx, {"project_id": proj.id, "path": "auth.py"})
    assert res.is_error
    assert res.content == "Project not found in this workspace."


async def test_load_project_isolated_without_ctx_fallback(db_session):
    # No ctx.project_id → a wrong id resolves to nothing (workspace isolation intact).
    ws, _ = await _ready_project(db_session)
    reg = build_code_tools_registry()
    ctx = ToolContext(db=db_session, workspace=ws, user=None, role="owner")
    res = await reg.get("read_file").handler(ctx, {"project_id": "nope", "path": "auth.py"})
    assert res.is_error
