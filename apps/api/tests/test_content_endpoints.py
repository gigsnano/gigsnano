from gigsnano_api.features.content.schemas import (
    ContentError,
    FromMarkdownIn,
    FromMarkdownOut,
    ToMarkdownIn,
    ToMarkdownOut,
)
from gigsnano_api.features.content.service import to_markdown, from_markdown


def test_schemas_shapes():
    assert ToMarkdownIn(json={"type": "doc"}).json == {"type": "doc"}
    out = ToMarkdownOut(markdown="# x", lossy=["mermaid"])
    assert out.lossy == ["mermaid"]
    assert FromMarkdownIn(markdown="# x").markdown == "# x"
    err = ContentError(message="bad", line=2, col=None)
    assert err.line == 2
    fm = FromMarkdownOut(json=None, errors=[err])
    assert fm.errors[0].message == "bad"


DOC = {
    "type": "doc",
    "content": [
        {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Hi"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "body"}]},
    ],
}


def test_to_markdown_serializes():
    out = to_markdown(DOC)
    assert "Hi" in out.markdown
    assert out.lossy == []  # plain prose round-trips cleanly


def test_from_markdown_parses_clean():
    out = from_markdown("## Hi\n\nbody")
    assert out.errors == []
    assert out.json is not None
    assert out.json["type"] == "doc"


def test_from_markdown_reports_error_on_bad_input(monkeypatch):
    # Force the converter to raise; the service must not propagate — it returns an error.
    import gigsnano_api.features.content.service as svc
    monkeypatch.setattr(svc, "markdown_to_doc", lambda _t: (_ for _ in ()).throw(ValueError("boom")))
    out = from_markdown("anything")
    assert out.json is None
    assert out.errors and "boom" in out.errors[0].message


def test_to_markdown_reports_lossy_when_a_type_is_dropped(monkeypatch):
    """Verify that node types lost on round-trip are detected and reported."""
    import gigsnano_api.features.content.service as svc
    doc = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Hi"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "body"}]},
        ],
    }
    # Patch markdown_to_doc to return a doc without the heading, simulating a lossy round-trip.
    monkeypatch.setattr(
        svc,
        "markdown_to_doc",
        lambda _t: {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "body"}]}]},
    )
    # Patch validate_doc to pass through.
    monkeypatch.setattr(svc, "validate_doc", lambda d: d)
    out = to_markdown(doc)
    assert "heading" in out.lossy


async def _signed_in(client):
    await client.post("/api/auth/sign-up/", json={
        "display_name": "Ada", "email": "ada@example.test", "password": "s3cret!",
    })


async def test_to_markdown_endpoint(client):
    await _signed_in(client)
    r = await client.post("/api/content/to-markdown/", json={"json": DOC})
    assert r.status_code == 200
    assert "Hi" in r.json()["markdown"]


async def test_from_markdown_endpoint(client):
    await _signed_in(client)
    r = await client.post("/api/content/from-markdown/", json={"markdown": "## Hi\n\nbody"})
    assert r.status_code == 200
    body = r.json()
    assert body["errors"] == []
    assert body["json"]["type"] == "doc"


async def test_to_markdown_endpoint_requires_auth(client):
    r = await client.post("/api/content/to-markdown/", json={"json": DOC})
    assert r.status_code == 401


def test_semantic_refs_survive_edited_roundtrip():
    """Verify that workItemRef semantic IDs survive a markdown round trip.

    This test ensures that when a doc with a workItemRef is serialized to markdown
    and parsed back, the original workItemId is preserved in the parsed doc.
    """
    doc = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [
                {"type": "workItemRef", "attrs": {"workItemId": "w1", "code": "GIN-7", "title": ""}},
            ]},
        ],
    }
    md = to_markdown(doc).markdown
    back = from_markdown(md).json

    def find_node(node, predicate):
        """Recursively walk a TipTap JSON doc (dict/list) for a node matching `predicate`."""
        if isinstance(node, dict):
            if predicate(node):
                return node
            for value in node.values():
                found = find_node(value, predicate)
                if found is not None:
                    return found
        elif isinstance(node, list):
            for item in node:
                found = find_node(item, predicate)
                if found is not None:
                    return found
        return None

    ref_node = find_node(
        back,
        lambda n: n.get("type") == "workItemRef" and n.get("attrs", {}).get("workItemId") == "w1",
    )
    assert ref_node is not None, f"no workItemRef node with workItemId=w1 survived roundtrip: {back}"
