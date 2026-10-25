from gigsnano_api.bmad.provider import FakeProvider


class _CapturingProvider(FakeProvider):
    """Records the system/messages passed to extract() so a test can assert what
    context reached the model."""

    def __init__(self, extractions):
        super().__init__(extractions=extractions)
        self.calls: list[dict] = []

    async def extract(self, *, system, messages, tool_name, schema):
        self.calls.append({"system": system, "messages": messages})
        return await super().extract(
            system=system, messages=messages, tool_name=tool_name, schema=schema
        )


async def _auth(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })
    await client.post("/api/workspaces/", json={"name": "Acme", "slug": "acme"})


async def test_ai_assistant_returns_html(client, app):
    await _auth(client)
    app.state.llm_provider = FakeProvider(
        extractions=[{"title": "Sign-in", "markdown": "# Sign-in\n\nLet users **sign in**."}]
    )
    res = await client.post("/api/workspaces/acme/ai-assistant/", json={
        "prompt": "Sign-in flow", "task": "Generate a description for this work item.",
    })
    assert res.status_code == 200
    html = res.json()["response_html"]
    assert "<h1>" in html and "<strong>sign in</strong>" in html


async def test_ai_assistant_requires_membership(client):
    res = await client.post("/api/workspaces/acme/ai-assistant/", json={"prompt": "x", "task": "y"})
    assert res.status_code in (401, 403, 404)


async def test_ai_assistant_402_when_no_balance(client, app):
    """GIN-14: with a real (non-fake) provider and an empty wallet, the AI assistant
    must 402 before generating — the balance gate applies here, not just to work-item
    creation. `object()` stands in for a paid provider; the guard raises before it's
    ever called."""
    await _auth(client)
    app.state.llm_provider = object()  # non-Fake → balance gate engages
    res = await client.post("/api/workspaces/acme/ai-assistant/", json={
        "prompt": "Sign-in flow", "task": "Generate a description for this work item.",
    })
    assert res.status_code == 402


async def test_ai_assistant_extraction_exhausted_502(client, app):
    await _auth(client)
    bad = {"title": "x"}  # missing markdown → always schema-invalid
    app.state.llm_provider = FakeProvider(extractions=[bad, bad, bad])
    res = await client.post("/api/workspaces/acme/ai-assistant/", json={
        "prompt": "Sign-in flow", "task": "Generate a description for this work item.",
    })
    assert res.status_code == 502


async def test_ai_assistant_grounds_in_project_context(client, app):
    await _auth(client)
    proj = (await client.post("/api/workspaces/acme/projects/", json={
        "name": "Aurora Billing", "identifier": "AUR", "flow": "fresh", "has_ui": False,
        "cover_image_url": "https://img.test/c.jpg",
    })).json()
    await client.post(
        f"/api/workspaces/acme/projects/{proj['id']}/stories/",
        json={"title": "Prorated invoice engine"},
    )
    cap = _CapturingProvider(extractions=[{"title": "Refunds", "markdown": "# Refunds\n\nHandle refunds."}])
    app.state.llm_provider = cap
    res = await client.post("/api/workspaces/acme/ai-assistant/", json={
        "prompt": "Refund handling",
        "task": "Generate a description for this work item.",
        "project_id": proj["id"],
    })
    assert res.status_code == 200
    blob = str(cap.calls[-1])
    # The project name and a sibling work item's title must reach the model, so the
    # generated description is grounded in this project — not a generic title expansion.
    assert "Aurora Billing" in blob
    assert "Prorated invoice engine" in blob
