from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    EChatRole,
    GigsMessage,
    GigsThread,
    Project,
    Workspace,
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
    return ws, project


async def test_thread_defaults_and_messages(db_session):
    ws, project = await _workspace_project(db_session)
    thread = GigsThread(workspace_id=ws.id, project_id=project.id)
    db_session.add(thread)
    await db_session.commit()
    assert thread.title == "New chat"
    assert thread.model == "sonnet-5"

    msg = GigsMessage(thread_id=thread.id, role=EChatRole.USER, content="Hi")
    db_session.add(msg)
    await db_session.commit()
    assert msg.role is EChatRole.USER
    assert msg.content == "Hi"


async def test_thread_project_optional(db_session):
    ws, _ = await _workspace_project(db_session)
    thread = GigsThread(workspace_id=ws.id)  # workspace-level, no project
    db_session.add(thread)
    await db_session.commit()
    assert thread.project_id is None
