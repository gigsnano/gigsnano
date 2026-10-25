import pytest

from gigsnano_api.models import ENotificationKind, NotificationTemplate
from tests.helpers import make_staff


@pytest.fixture(autouse=True)
async def seed_templates(db_session):
    db_session.add(
        NotificationTemplate(
            trigger_key="story.assigned",
            kind=ENotificationKind.ASSIGNMENT,
            label="Story assigned",
            description="Assignee set.",
            title_template="{story}",
            body_template="{actor} assigned you in {project}",
            default_title_template="{story}",
            default_body_template="{actor} assigned you in {project}",
            variables=["actor", "project", "story"],
            enabled=True,
        )
    )
    await db_session.commit()


async def test_list_templates_requires_privilege(client, db_session):
    await make_staff(client, db_session, is_system=False, privileges=["roles.read"])
    assert (await client.get("/api/admin/notification-templates/")).status_code == 403


async def test_list_and_get_template(client, db_session):
    await make_staff(client, db_session)
    rows = (await client.get("/api/admin/notification-templates/")).json()
    assert len(rows) == 1
    assert rows[0]["trigger_key"] == "story.assigned"
    one = (await client.get("/api/admin/notification-templates/story.assigned/")).json()
    assert one["label"] == "Story assigned"


async def test_patch_template_and_audit(client, db_session):
    await make_staff(client, db_session)
    res = await client.patch(
        "/api/admin/notification-templates/story.assigned/",
        json={"body_template": "{actor} pinged you on {story}"},
    )
    assert res.status_code == 200
    assert "pinged" in res.json()["body_template"]

    logs = (await client.get("/api/admin/audit-logs/?action=notification_template.update")).json()
    assert len(logs) >= 1


async def test_patch_rejects_unknown_placeholder(client, db_session):
    await make_staff(client, db_session)
    res = await client.patch(
        "/api/admin/notification-templates/story.assigned/",
        json={"body_template": "{actor} and {bogus} on {story}"},
    )
    assert res.status_code == 422


async def test_reset_template(client, db_session):
    await make_staff(client, db_session)
    await client.patch(
        "/api/admin/notification-templates/story.assigned/",
        json={"body_template": "custom body"},
    )
    res = await client.post("/api/admin/notification-templates/story.assigned/reset/")
    assert res.status_code == 200
    assert res.json()["body_template"] == "{actor} assigned you in {project}"
