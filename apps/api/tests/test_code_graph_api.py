from gigsnano_api.models import ECloneStatus, ECodeArtifactKind, EIndexStatus, Project
from gigsnano_api.workspace.graph_view import aggregate_communities

from tests.helpers import seed_code_artifact

CREATE = {
    "name": "Mobile Banking App",
    "identifier": "MBA",
    "flow": "fresh",
    "cover_image_url": "https://img.test/c.jpg",
}


def test_aggregate_passthrough_when_small():
    g = {"nodes": [{"id": "a"}, {"id": "b"}], "edges": []}
    assert aggregate_communities(g, max_nodes=10) == g


def test_aggregate_collapses_by_directory_when_large():
    nodes = [{"id": f"src/x/f{i}.py:fn", "source_file": f"src/x/f{i}.py"} for i in range(5)]
    nodes += [{"id": f"src/y/g{i}.py:fn", "source_file": f"src/y/g{i}.py"} for i in range(5)]
    g = {"nodes": nodes, "edges": [{"source": nodes[0]["id"], "target": nodes[5]["id"]}]}
    agg = aggregate_communities(g, max_nodes=4)
    ids = {n["id"] for n in agg["nodes"]}
    assert ids == {"src/x", "src/y"}
    assert agg["edges"][0]["weight"] == 1


async def _setup_ws(client):
    await client.post(
        "/api/auth/sign-up/",
        json={
            "display_name": "Ada Lovelace",
            "email": "ada@example.test",
            "password": "s3cret!",
        },
    )
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def _make_ready_project(client, db_session, identifier="MBA"):
    payload = {**CREATE, "identifier": identifier}
    project = (await client.post("/api/workspaces/acme/projects/", json=payload)).json()
    p = await db_session.get(Project, project["id"])
    p.clone_status = ECloneStatus.READY
    p.index_status = EIndexStatus.READY
    await db_session.commit()
    await seed_code_artifact(
        db_session,
        p.id,
        ECodeArtifactKind.GRAPH,
        {"nodes": [{"id": "auth.py:login", "label": "login", "source_file": "auth.py"}], "edges": []},
    )
    return project


async def test_code_graph_endpoint_returns_graph_for_ready_project(client, db_session):
    await _setup_ws(client)
    project = await _make_ready_project(client, db_session)

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/graph/")

    assert res.status_code == 200
    body = res.json()
    assert body["nodes"][0]["id"] == "auth.py:login"
    assert body["edges"] == []


async def test_code_graph_endpoint_409s_when_index_not_ready(client):
    await _setup_ws(client)
    project = (await client.post("/api/workspaces/acme/projects/", json=CREATE)).json()
    assert project["index_status"] == "none"

    res = await client.get(f"/api/workspaces/acme/projects/{project['id']}/code/graph/")

    assert res.status_code == 409


async def test_code_graph_endpoint_404s_cross_workspace(client, db_session):
    await _setup_ws(client)
    project = await _make_ready_project(client, db_session)
    await client.post("/api/workspaces/", json={"name": "Other", "slug": "other"})

    res = await client.get(f"/api/workspaces/other/projects/{project['id']}/code/graph/")

    assert res.status_code == 404
