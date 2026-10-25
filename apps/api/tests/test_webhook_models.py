from sqlalchemy import select
from sqlalchemy.orm import selectinload

from gigsnano_api.models import (
    EDeliveryStatus,
    Webhook,
    WebhookDelivery,
    Workspace,
)


async def test_webhook_and_delivery_persist(db_session):
    ws = Workspace(slug="acme", name="Acme")
    db_session.add(ws)
    await db_session.flush()

    wh = Webhook(
        workspace_id=ws.id, url="https://hooks.test/x",
        events=["story.created"], secret="whsec_" + "a" * 40,
    )
    db_session.add(wh)
    await db_session.flush()

    db_session.add(WebhookDelivery(
        webhook_id=wh.id, event="webhook.test",
        status=EDeliveryStatus.SUCCESS, response_code=200,
    ))
    await db_session.commit()

    # Re-query with an explicit selectinload — this codebase's AsyncSession convention
    # for relationship access (see domain/documents.py, members.py, project_members.py).
    # A bare `db_session.get(...)` returns the already-resident, unexpired identity-map
    # instance without loading `deliveries`, and a later sync attribute access would
    # raise sqlalchemy.exc.MissingGreenlet outside an awaited call.
    got = (
        await db_session.execute(
            select(Webhook)
            .where(Webhook.id == wh.id)
            .options(selectinload(Webhook.deliveries))
        )
    ).scalar_one()
    assert got.enabled is True                       # column default
    assert got.events == ["story.created"]
    assert len(got.deliveries) == 1
    assert got.deliveries[0].status == EDeliveryStatus.SUCCESS
    assert got.deliveries[0].response_code == 200
