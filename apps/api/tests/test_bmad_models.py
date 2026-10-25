import pytest
from sqlalchemy.exc import IntegrityError

from gigsnano_api.auth.models import User
from gigsnano_api.models import (
    Artifact,
    ChatMessage,
    ChatThread,
    EArtifactStatus,
    EChatRole,
    ESessionState,
    Project,
    Story,
    WorkflowSession,
    Workspace,
)


async def seed(db_session):
    user = User(email="ada@example.test", display_name="Ada Lovelace", password_hash="x")
    ws = Workspace(slug="acme", name="Acme")
    db_session.add_all([user, ws])
    await db_session.flush()
    project = Project(workspace_id=ws.id, name="App", identifier="APP",
                      cover_image_url="https://img.test/c.jpg")
    db_session.add(project)
    await db_session.flush()
    story = Story(project_id=project.id, title="Create the PRD", sort_order=0,
                  bmad_workflow="bmad-prd")
    db_session.add(story)
    await db_session.flush()
    return project, story


async def test_artifact_defaults(db_session):
    project, story = await seed(db_session)
    artifact = Artifact(project_id=project.id, doc_type="prd", title="PRD",
                        content_md="# PRD", source_story_id=story.id,
                        source_workflow="bmad-prd")
    db_session.add(artifact)
    await db_session.commit()
    assert artifact.status == EArtifactStatus.DRAFT
    assert artifact.version == 1
    assert artifact.structured_json is None


async def test_one_thread_per_story(db_session):
    project, story = await seed(db_session)
    db_session.add(ChatThread(project_id=project.id, story_id=story.id))
    await db_session.commit()
    db_session.add(ChatThread(project_id=project.id, story_id=story.id))
    with pytest.raises(IntegrityError):
        await db_session.commit()


async def test_session_and_messages(db_session):
    project, story = await seed(db_session)
    thread = ChatThread(project_id=project.id, story_id=story.id)
    db_session.add(thread)
    await db_session.flush()
    session = WorkflowSession(thread_id=thread.id, workflow_id="bmad-prd",
                              bmad_version="6.0-gigsnano-1")
    msg = ChatMessage(thread_id=thread.id, role=EChatRole.USER, content="Hi")
    db_session.add_all([session, msg])
    await db_session.commit()
    assert session.state == ESessionState.CONVERSING
    assert session.context_artifact_ids == []
    assert msg.input_tokens is None
