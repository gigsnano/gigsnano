from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    EViewLayout,
    Page,
    Project,
    ProjectView,
    Workspace,
    WorkspaceView,
)


async def _workspace_project(db_session):
    user = User(email="ada@example.test", display_name="Ada Lovelace", password_hash="x")
    ws = Workspace(slug="acme", name="Acme")
    db_session.add_all([user, ws])
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="App", identifier="APP",
                      cover_image_url="https://img.test/c.jpg")
    db_session.add(project)
    await db_session.flush()
    return ws, project, user


async def test_rows_persist_and_defaults(db_session):
    ws, project, user = await _workspace_project(db_session)
    pv = ProjectView(
        project_id=project.id, owner_id=user.id, name="My board", layout=EViewLayout.BOARD
    )
    wv = WorkspaceView(
        workspace_id=ws.id, owner_id=user.id, name="All work", layout=EViewLayout.LIST
    )
    page = Page(project_id=project.id, title="Runbook")
    db_session.add_all([pv, wv, page])
    await db_session.commit()

    assert EViewLayout.BOARD.value == "board"
    assert pv.layout is EViewLayout.BOARD
    assert pv.description == "" and pv.filter_query == ""   # Text defaults
    assert pv.share_scope.value == "private"
    assert wv.workspace_id == ws.id
    assert page.content == ""   # Text default
    assert page.content_json is None
