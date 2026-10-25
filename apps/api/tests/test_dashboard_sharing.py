"""Public dashboard sharing (GIN-489)."""

WIDGETS = {
    "widgets": [
        {"id": "w_status", "type": "status_chart", "title": "Status", "x": 0, "y": 0, "w": 4, "h": 4,
         "settings": {}},
        {"id": "w_mine", "type": "assigned_to_me", "title": "Mine", "x": 4, "y": 0, "w": 4, "h": 4,
         "settings": {}},
        {"id": "w_people", "type": "team_workload", "title": "Team", "x": 8, "y": 0, "w": 4, "h": 4,
         "settings": {}},
    ]
}


async def _setup(client, config=None):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada Lovelace", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})
    dashboard = (
        await client.post("/api/workspaces/acme/dashboards/", json={
            "name": "Delivery", "description": "Cross-project health",
            "config": config if config is not None else WIDGETS,
        })
    ).json()
    return dashboard


async def _publish(client, dashboard_id):
    return await client.post(
        f"/api/workspaces/acme/dashboards/{dashboard_id}/share/", json={"visibility": "public"}
    )


async def test_dashboards_start_private(client):
    dashboard = await _setup(client)
    assert dashboard["visibility"] == "private"
    assert dashboard["public_token"] is None


async def test_publish_returns_a_token_that_serves_the_dashboard_anonymously(client):
    dashboard = await _setup(client)
    published = (await _publish(client, dashboard["id"])).json()
    assert published["visibility"] == "public"
    token = published["public_token"]
    assert token and token not in dashboard["id"]  # not derived from the id
    assert len(token) >= 32

    await client.post("/api/auth/sign-out/")  # anonymous from here on
    res = await client.get(f"/api/public/dashboards/{token}/")
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Delivery"
    # Only the aggregate widget survives; the personal and per-person ones don't.
    assert [w["id"] for w in body["widgets"]] == ["w_status"]
    # No tenant/owner identifiers anywhere in the payload.
    assert not {"workspace_slug", "owner_id", "id", "workspace_id"} & set(body)


async def test_public_payload_and_metrics_carry_no_person_data(client):
    dashboard = await _setup(client)
    token = (await _publish(client, dashboard["id"])).json()["public_token"]
    await client.post("/api/auth/sign-out/")

    metrics = (
        await client.get(f"/api/public/dashboards/{token}/widgets/w_status/metrics/")
    ).json()
    assert metrics["assignee_counts"] == {}
    assert metrics["assignee_status_counts"] == {}
    assert "status_counts" in metrics


async def test_ineligible_widget_is_not_addressable_even_by_id(client):
    dashboard = await _setup(client)
    token = (await _publish(client, dashboard["id"])).json()["public_token"]
    await client.post("/api/auth/sign-out/")
    res = await client.get(f"/api/public/dashboards/{token}/widgets/w_mine/metrics/")
    assert res.status_code == 404


async def test_publishing_a_board_with_no_eligible_widgets_is_refused(client):
    dashboard = await _setup(client, config={"widgets": [WIDGETS["widgets"][1]]})
    res = await _publish(client, dashboard["id"])
    assert res.status_code == 422
    assert "publicly" in res.json()["detail"]


async def test_unpublish_revokes_the_link_immediately(client):
    dashboard = await _setup(client)
    token = (await _publish(client, dashboard["id"])).json()["public_token"]
    unpublished = (
        await client.post(
            f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
            json={"visibility": "private"},
        )
    ).json()
    assert unpublished["visibility"] == "private"
    assert unpublished["public_token"] is None

    await client.post("/api/auth/sign-out/")
    res = await client.get(f"/api/public/dashboards/{token}/")
    assert res.status_code == 404
    assert res.json()["detail"] == "This dashboard is unavailable"


async def test_regenerate_invalidates_the_previous_link(client):
    dashboard = await _setup(client)
    first = (await _publish(client, dashboard["id"])).json()["public_token"]
    second = (
        await client.post(
            f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/regenerate/"
        )
    ).json()["public_token"]
    assert second != first

    await client.post("/api/auth/sign-out/")
    assert (await client.get(f"/api/public/dashboards/{first}/")).status_code == 404
    assert (await client.get(f"/api/public/dashboards/{second}/")).status_code == 200


async def test_another_user_cannot_publish_someone_elses_dashboard(client):
    dashboard = await _setup(client)
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Alan Turing", "email": "alan@example.test", "password": "s3cret!",
    })
    res = await _publish(client, dashboard["id"])
    assert res.status_code in (403, 404)  # never publishes

    # And it really is still private.
    await client.post("/api/auth/sign-out/")
    await client.post("/api/auth/sign-in/", json={
        "email": "ada@example.test", "password": "s3cret!",
    })
    current = (
        await client.get(f"/api/workspaces/acme/dashboards/{dashboard['id']}/")
    ).json()
    assert current["visibility"] == "private"


async def test_share_actions_are_audit_logged(client, db_session):
    from sqlalchemy import select

    from gigsnano_api.models import AuditLog

    dashboard = await _setup(client)
    await _publish(client, dashboard["id"])
    await client.post(f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/regenerate/")
    await client.post(
        f"/api/workspaces/acme/dashboards/{dashboard['id']}/share/",
        json={"visibility": "private"},
    )

    rows = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.target_id == dashboard["id"])
        )
    ).scalars().all()
    assert {r.action for r in rows} == {
        "dashboard.publish",
        "dashboard.regenerate_link",
        "dashboard.unpublish",
    }
    assert all(r.actor_name == "Ada Lovelace" for r in rows)
