from gigsnano_api.models import ENotificationKind, NotificationTemplate


async def test_template_has_email_fields(db_session):
    t = NotificationTemplate(
        trigger_key="marketplace.bid_received",
        kind=ENotificationKind.SYSTEM,
        label="Marketplace bid",
        description="Bid received.",
        title_template="New bid",
        body_template="{bidder} bid on {listing}",
        default_title_template="New bid",
        default_body_template="{bidder} bid on {listing}",
        variables=["bidder", "listing", "amount"],
        enabled=True,
        email_enabled=True,
        email_subject_template="New bid on {listing}",
        email_body_html_template="<p>{bidder} bid on {listing}</p>",
    )
    db_session.add(t)
    await db_session.commit()
    assert t.email_enabled is True
    assert t.email_subject_template == "New bid on {listing}"
