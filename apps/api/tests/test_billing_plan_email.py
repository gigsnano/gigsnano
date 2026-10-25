"""GIN-129: plan upgrade/downgrade must email workspace admins. Regression guard
for the bug where subscription changes silently skipped the notification/email
seam that wallet top-ups already used."""

import json

from sqlalchemy import select

from gigsnano_api.email.provider import FakeEmailProvider
from gigsnano_api.models import (
    ENotificationKind,
    NotificationTemplate,
    User,
    Workspace,
)


def _tpl(key, subject, body, variables) -> NotificationTemplate:
    return NotificationTemplate(
        trigger_key=key,
        kind=ENotificationKind.SYSTEM,
        label=key,
        description="billing email test",
        title_template=subject,
        body_template=subject,
        default_title_template=subject,
        default_body_template=subject,
        variables=variables,
        enabled=True,
        email_enabled=True,
        email_subject_template=subject,
        email_body_html_template=body,
    )


async def _seed_templates(db) -> None:
    """Templates are seeded by migration in prod; tests use create_all, so seed
    them here (mirrors test_notification_email_bridge)."""
    db.add(_tpl("billing.plan_changed", "Your {workspace} plan is now {plan}",
                "<p>{workspace} is now on {plan}.</p>", ["workspace", "plan"]))
    db.add(_tpl("billing.invoice_paid", "Your {workspace} invoice — {amount}",
                "<p>{amount} paid. <a href=\"{invoice_url}\">Invoice</a></p>",
                ["workspace", "amount", "invoice_url"]))
    await db.flush()


async def _setup(client, db, slug, email, *, email_digest=True):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Owner", "email": email, "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": slug})
    ws = (await db.execute(select(Workspace).where(Workspace.slug == slug))).scalar_one()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one()
    user.email_digest = email_digest
    await _seed_templates(db)
    await db.commit()
    return ws


async def test_fake_checkout_upgrade_emails_admin(client, db_session):
    FakeEmailProvider.reset()
    ws = await _setup(client, db_session, "up1", "up1@example.test")
    r = await client.post(
        f"/api/workspaces/{ws.slug}/billing/checkout/",
        json={"tier": "pro", "interval": "monthly"},
    )
    assert r.status_code == 200
    assert any(
        m["to"] == "up1@example.test" and "Pro" in m["subject"]
        for m in FakeEmailProvider.sent
    ), FakeEmailProvider.sent


async def test_webhook_downgrade_to_free_emails_admin(client, db_session):
    FakeEmailProvider.reset()
    ws = await _setup(client, db_session, "dn1", "dn1@example.test")
    # Establish a paid Stripe-linked sub, then cancel it.
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_dn1", "customer": "cus_dn1", "subscription": "sub_dn1",
            "metadata": {"kind": "subscription", "workspace_id": ws.id, "tier": "pro"},
        }},
    }))
    FakeEmailProvider.reset()  # ignore the upgrade email; assert only the downgrade
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_dn1", "customer": "cus_dn1"}},
    }))
    assert any(
        m["to"] == "dn1@example.test" and "Free" in m["subject"]
        for m in FakeEmailProvider.sent
    ), FakeEmailProvider.sent


async def test_plan_email_reaches_digest_opted_out_user(client, db_session):
    # A billing receipt is transactional — an unsubscribed (email_digest=False)
    # admin must STILL get it. This is why top-up/plan emails silently vanished.
    FakeEmailProvider.reset()
    ws = await _setup(client, db_session, "tx1", "tx1@example.test", email_digest=False)
    await client.post(
        f"/api/workspaces/{ws.slug}/billing/checkout/",
        json={"tier": "pro", "interval": "monthly"},
    )
    assert any(m["to"] == "tx1@example.test" for m in FakeEmailProvider.sent), \
        FakeEmailProvider.sent


async def test_invoice_payment_succeeded_emails_invoice_copy(client, db_session):
    FakeEmailProvider.reset()
    ws = await _setup(client, db_session, "inv1", "inv1@example.test")
    # Link a Stripe sub, then simulate a monthly renewal payment.
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_inv1", "customer": "cus_inv1", "subscription": "sub_inv1",
            "metadata": {"kind": "subscription", "workspace_id": ws.id, "tier": "pro"},
        }},
    }))
    FakeEmailProvider.reset()
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "invoice.payment_succeeded",
        "data": {"object": {
            "subscription": "sub_inv1", "customer": "cus_inv1",
            "amount_paid": 2900, "billing_reason": "subscription_cycle",
            "hosted_invoice_url": "https://invoice.stripe.test/inv_1",
        }},
    }))
    hit = [m for m in FakeEmailProvider.sent if m["to"] == "inv1@example.test"]
    assert hit, FakeEmailProvider.sent
    assert "$29.00" in hit[0]["subject"]
    assert "https://invoice.stripe.test/inv_1" in hit[0]["html"]


async def test_invoice_zero_amount_still_emails(client, db_session):
    # Free renewals / 100%-off coupons still get an invoice copy ($0.00).
    FakeEmailProvider.reset()
    ws = await _setup(client, db_session, "inv0", "inv0@example.test")
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_inv0", "customer": "cus_inv0", "subscription": "sub_inv0",
            "metadata": {"kind": "subscription", "workspace_id": ws.id, "tier": "pro"},
        }},
    }))
    FakeEmailProvider.reset()
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "invoice.payment_succeeded",
        "data": {"object": {
            "subscription": "sub_inv0", "customer": "cus_inv0",
            "amount_paid": 0, "billing_reason": "subscription_cycle",
            "hosted_invoice_url": "https://invoice.stripe.test/inv_0",
        }},
    }))
    hit = [m for m in FakeEmailProvider.sent if m["to"] == "inv0@example.test"]
    assert hit, FakeEmailProvider.sent
    assert "$0.00" in hit[0]["subject"]


async def test_webhook_update_without_tier_change_does_not_email(client, db_session):
    FakeEmailProvider.reset()
    ws = await _setup(client, db_session, "nc1", "nc1@example.test")
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_nc1", "customer": "cus_nc1", "subscription": "sub_nc1",
            "metadata": {"kind": "subscription", "workspace_id": ws.id, "tier": "pro"},
        }},
    }))
    FakeEmailProvider.reset()
    # A renewal ping that keeps the same tier must NOT spam an email.
    await client.post("/api/billing/webhook/", content=json.dumps({
        "type": "customer.subscription.updated",
        "data": {"object": {
            "id": "sub_nc1", "customer": "cus_nc1", "status": "active",
            "current_period_end": 1800000000,
            "items": {"data": [{"price": {"metadata": {"gigsnano_tier": "pro"}}}]},
        }},
    }))
    assert FakeEmailProvider.sent == []
