"""GIN-394: package upload over HTTP, including who may not do it."""


async def _signup_ws(client, email="ada@example.test", slug="acme"):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": email, "password": "s3cret!"})
    await client.post("/api/workspaces/", json={"name": slug.title(), "slug": slug})


async def _project(client, slug="acme", name="Northwind", identifier="NWD"):
    r = await client.post(
        f"/api/workspaces/{slug}/projects/",
        json={
            "name": name,
            "identifier": identifier,
            "flow": "fresh",
            "has_ui": True,
            "cover_image_url": "https://img.test/c.jpg",
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def test_upload_creates_a_package_with_documents(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    r = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/",
        json={
            "name": "Northwind delivery",
            "files": [
                {"file_name": "brief.md", "mime_type": "text/markdown", "content": "# Brief"},
                {"file_name": "arch.md", "mime_type": "text/markdown", "content": "# Arch"},
            ],
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Northwind delivery"
    assert body["counts"] == {"total": 2, "ready": 2, "needs_attention": 0}
    assert {d["file_name"] for d in body["documents"]} == {"brief.md", "arch.md"}

    got = await client.get(f"/api/workspaces/acme/projects/{pid}/packages/{body['id']}/")
    assert got.status_code == 200
    assert len(got.json()["documents"]) == 2


async def test_mixed_outcomes_are_counted_not_fatal(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    r = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/",
        json={
            "name": "Mixed",
            "files": [
                {"file_name": "good.md", "mime_type": "text/markdown", "content": "# Good"},
                {"file_name": "blank.pdf", "mime_type": "application/pdf", "content": ""},
            ],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["counts"] == {"total": 2, "ready": 1, "needs_attention": 1}


async def test_empty_file_list_is_rejected(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    r = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/", json={"name": "Empty", "files": []}
    )
    assert r.status_code == 422


async def test_another_tenant_cannot_read_or_write_the_package(app, client):
    await _signup_ws(client, email="a@example.test", slug="acme")
    pid = await _project(client)
    created = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/",
        json={"name": "Private", "files": [
            {"file_name": "a.md", "mime_type": "text/markdown", "content": "# A"}]},
    )
    package_id = created.json()["id"]

    await client.post("/api/auth/sign-out/")
    await _signup_ws(client, email="b@example.test", slug="beta")
    # 404, never 403 — a 403 would confirm the project exists.
    assert (await client.get(
        f"/api/workspaces/beta/projects/{pid}/packages/{package_id}/")).status_code == 404
    assert (await client.post(
        f"/api/workspaces/beta/projects/{pid}/packages/",
        json={"name": "x", "files": [
            {"file_name": "a.md", "mime_type": "text/markdown", "content": "# A"}]},
    )).status_code == 404


async def _upload(client, pid, files, name="Northwind delivery"):
    r = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/", json={"name": name, "files": files}
    )
    assert r.status_code == 201, r.text
    return r.json()


_SPEC_FILE = {
    "file_name": "mobile-spec.md",
    "mime_type": "text/markdown",
    "content": "# Mobile spec\n\n## Architecture\n\nStack is React Native, approved.\n",
}


async def test_analyse_returns_grouped_findings(app, client, monkeypatch):
    from gigsnano_api.bmad.provider import FakeProvider

    await _signup_ws(client)
    pid = await _project(client)
    package = await _upload(client, pid, [_SPEC_FILE])

    app.state.llm_provider = FakeProvider(extractions=[
        {"findings": []},  # "Mobile spec" preamble section
        {"findings": [{"kind": "decision", "status": "approved",
                       "title": "Stack is React Native", "confidence": 0.9}]},
    ])
    r = await client.post(f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/analyse/")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "analysed"
    assert body["counts_by_kind"] == {"decision": 1}
    assert body["counts_by_status"] == {"approved": 1}
    assert body["findings"][0]["anchor"].endswith("Architecture")

    listed = await client.get(
        f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/findings/"
    )
    assert listed.status_code == 200
    assert len(listed.json()["findings"]) == 1


async def test_user_can_correct_a_classification_without_erasing_the_ai_verdict(app, client):
    from gigsnano_api.bmad.provider import FakeProvider

    await _signup_ws(client)
    pid = await _project(client)
    package = await _upload(client, pid, [_SPEC_FILE])
    app.state.llm_provider = FakeProvider(extractions=[
        {"findings": []},
        {"findings": []},
    ])
    await client.post(f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/analyse/")

    document_id = package["documents"][0]["id"]
    r = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/documents/{document_id}/",
        json={"doc_type": "design_system", "canonical": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["canonical"] is True

    bad = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/documents/{document_id}/",
        json={"doc_type": "not-a-real-type"},
    )
    assert bad.status_code == 422


async def test_finding_override_is_recorded_beside_the_original(app, client):
    from gigsnano_api.bmad.provider import FakeProvider

    await _signup_ws(client)
    pid = await _project(client)
    package = await _upload(client, pid, [_SPEC_FILE])
    app.state.llm_provider = FakeProvider(extractions=[
        {"findings": []},
        {"findings": [{"kind": "decision", "status": "proposed", "title": "Stack is RN"}]},
    ])
    analysed = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/analyse/"
    )
    finding_id = analysed.json()["findings"][0]["id"]

    r = await client.patch(
        f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/findings/{finding_id}/",
        json={"status": "approved"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "proposed"          # the AI's original stands
    assert body["override"] == {"status": "approved"}  # the human's call sits beside it


async def _analysed(client, app, pid, findings):
    """Upload + analyse a package, scripting the model to return `findings`."""
    from gigsnano_api.bmad.provider import FakeProvider

    package = await _upload(client, pid, [_SPEC_FILE])
    app.state.llm_provider = FakeProvider(extractions=[
        {"findings": []},          # preamble section
        {"findings": findings},    # "Architecture" section
    ])
    r = await client.post(f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/analyse/")
    assert r.status_code == 200, r.text
    return package


async def test_plan_is_a_dry_run_that_creates_nothing(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [
        {"kind": "phase", "status": "approved", "title": "Phase 0", "confidence": 0.9},
        {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
    ])

    before = await client.get(f"/api/workspaces/acme/projects/{pid}/stories/")
    r = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/plan/",
        json={"strategy": "convert"},
    )
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["counts_by_target"] == {"cycle": 1, "epic": 1, "milestone": 1, "story": 1}
    assert plan["can_apply"] is False  # nothing approved yet
    # The dry run created no work items.
    after = await client.get(f"/api/workspaces/acme/projects/{pid}/stories/")
    assert len(after.json()["items"]) == len(before.json()["items"])


async def test_approving_changes_opens_the_gate(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [
        {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
    ])
    base = f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}"
    await client.post(base + "/plan/", json={"strategy": "convert"})

    decided = await client.post(base + "/plan/decide/", json={"decision": "approved"})
    assert decided.status_code == 200, decided.text
    assert decided.json()["counts_by_status"] == {"approved": 1}
    assert decided.json()["can_apply"] is True


async def test_a_conflict_blocks_the_plan_and_says_how_to_resolve_it(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [
        {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
        {"kind": "decision", "status": "conflict", "title": "Two stacks named"},
    ])
    base = f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}"
    await client.post(base + "/plan/", json={"strategy": "convert"})
    approved = await client.post(base + "/plan/decide/", json={"decision": "approved"})

    body = approved.json()
    assert body["can_apply"] is False
    assert [c["title"] for c in body["blocking_conflicts"]] == ["Two stacks named"]
    assert "Resolve it by overriding" in body["blocking_conflicts"][0]["resolution"]
    # The conflicting finding was never proposed as work.
    assert "Two stacks named" not in [c["title"] for c in body["changes"]]


async def test_switching_strategy_rebuilds_without_losing_findings(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [
        {"kind": "phase", "status": "approved", "title": "Phase 0", "confidence": 0.9},
    ])
    base = f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}"

    convert = await client.post(base + "/plan/", json={"strategy": "convert"})
    assert "milestone" in convert.json()["counts_by_target"]

    preserve = await client.post(base + "/plan/", json={"strategy": "preserve"})
    assert "milestone" not in preserve.json()["counts_by_target"]  # nothing invented
    # The findings — and any user corrections to them — survive a strategy change.
    findings = await client.get(base + "/findings/")
    assert len(findings.json()["findings"]) == 1


async def test_unknown_strategy_is_rejected(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [])
    r = await client.post(
        f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}/plan/",
        json={"strategy": "vibes"},
    )
    assert r.status_code == 422


async def test_apply_is_refused_while_a_conflict_is_unresolved(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [
        {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
        {"kind": "decision", "status": "conflict", "title": "Two stacks named"},
    ])
    base = f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}"
    await client.post(base + "/plan/", json={"strategy": "convert"})
    await client.post(base + "/plan/decide/", json={"decision": "approved"})

    blocked = await client.post(base + "/plan/apply/")
    assert blocked.status_code == 409
    assert "Two stacks named" in blocked.json()["detail"]

    # Nothing was created while the gate was closed.
    stories = await client.get(f"/api/workspaces/acme/projects/{pid}/stories/")
    assert "Set up CI" not in [s["title"] for s in stories.json()["items"]]


async def test_apply_then_rollback_over_http(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [
        {"kind": "phase", "status": "approved", "title": "Phase 0", "confidence": 0.9},
        {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
    ])
    base = f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}"
    await client.post(base + "/plan/", json={"strategy": "convert"})
    await client.post(base + "/plan/decide/", json={"decision": "approved"})

    applied = await client.post(base + "/plan/apply/")
    assert applied.status_code == 200, applied.text
    assert applied.json()["status"] == "applied"
    titles = [s["title"] for s in (await client.get(
        f"/api/workspaces/acme/projects/{pid}/stories/")).json()["items"]]
    assert {"Phase 0", "Set up CI"} <= set(titles)

    rolled = await client.post(base + "/plan/rollback/")
    assert rolled.status_code == 200, rolled.text
    after = [s["title"] for s in (await client.get(
        f"/api/workspaces/acme/projects/{pid}/stories/")).json()["items"]]
    assert "Set up CI" not in after

    # A rolled-back plan must be rebuilt, not resurrected.
    again = await client.post(base + "/plan/apply/")
    assert again.status_code == 409


async def test_rollback_without_an_apply_is_refused(app, client):
    await _signup_ws(client)
    pid = await _project(client)
    package = await _analysed(client, app, pid, [
        {"kind": "task", "status": "approved", "title": "Set up CI", "confidence": 0.9},
    ])
    base = f"/api/workspaces/acme/projects/{pid}/packages/{package['id']}"
    await client.post(base + "/plan/", json={"strategy": "convert"})
    assert (await client.post(base + "/plan/rollback/")).status_code == 409
