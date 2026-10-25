from gigsnano_api.auth.models import User
from gigsnano_api.lib.mentions import (
    extract_mention_names,
    extract_mention_user_ids_from_html,
    resolve_mention_user_ids,
)
from gigsnano_api.models import (
    EMemberStatus,
    EProjectRole,
    EWorkspaceRole,
    Project,
    ProjectMember,
    Workspace,
    WorkspaceMember,
)


def test_extract_mention_names_plain():
    catalog = {"Ada Lovelace", "Bob"}
    names = extract_mention_names("Hey @Ada Lovelace and @Bob — review this", catalog=catalog)
    assert names == {"Ada Lovelace", "Bob"}


def test_extract_mention_names_html():
    catalog = {"Grace Hopper"}
    names = extract_mention_names("<p>Please see <strong>@Grace Hopper</strong></p>", catalog=catalog)
    assert names == {"Grace Hopper"}


def test_extract_mention_names_empty():
    assert extract_mention_names("") == set()


def test_extract_mention_user_ids_from_html():
    html = (
        '<p>Hey <mention-component id="x" entity_identifier="user-123" '
        'entity_name="user_mention"></mention-component> please review</p>'
    )
    assert extract_mention_user_ids_from_html(html) == {"user-123"}


def test_extract_mention_user_ids_from_html_ignores_other_entities():
    html = (
        '<mention-component entity_identifier="doc-1" entity_name="document"></mention-component>'
    )
    assert extract_mention_user_ids_from_html(html) == set()


async def test_resolve_mention_user_ids(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()
    user = User(email="ada@test", display_name="Ada Lovelace", password_hash="x")
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=user.id,
            role=EWorkspaceRole.MEMBER,
            status=EMemberStatus.ACTIVE,
        )
    )
    project = Project(
        workspace_id=ws.id, name="App", identifier="APP", cover_image_url="https://x.test/c.jpg"
    )
    db_session.add(project)
    await db_session.flush()
    db_session.add(
        ProjectMember(
            project_id=project.id,
            user_id=user.id,
            role=EProjectRole.MEMBER,
            status=EMemberStatus.ACTIVE,
        )
    )
    await db_session.commit()

    ids = await resolve_mention_user_ids(
        db_session, ws.id, project.id, "Ping @Ada Lovelace and @Unknown Person"
    )
    assert ids == {user.id}
