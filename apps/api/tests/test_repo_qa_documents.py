from gigsnano_api.agent.tools.documents import _read_document, _search_documents
from gigsnano_api.models import Artifact, Project


async def _proj(db, ws_id="w", identifier="P1"):
    p = Project(workspace_id=ws_id, name="P", identifier=identifier, cover_image_url="x")
    db.add(p)
    await db.commit()
    return p


async def test_search_and_read_documents(db_session, make_workspace_ctx):
    ctx, ws = make_workspace_ctx(db_session)  # helper providing ToolContext + Workspace
    proj = await _proj(db_session, ws.id)
    db_session.add(
        Artifact(
            project_id=proj.id,
            doc_type="prd",
            title="Product Requirements",
            content_md="The login flow uses OAuth.",
            status="final",
        )
    )
    await db_session.commit()
    res = await _search_documents(ctx, {"project_id": proj.id, "query": "login"})
    assert "Product Requirements" in res.content and "prd" in res.content
    read = await _read_document(ctx, {"project_id": proj.id, "ref": "Product Requirements"})
    assert "OAuth" in read.content and "[doc:Product Requirements]" in read.content


async def test_read_document_returns_latest_version(db_session, make_workspace_ctx):
    ctx, ws = make_workspace_ctx(db_session)
    proj = await _proj(db_session, ws.id)
    db_session.add(
        Artifact(
            project_id=proj.id,
            doc_type="prd",
            title="Spec",
            content_md="old",
            status="final",
            version=1,
        )
    )
    db_session.add(
        Artifact(
            project_id=proj.id,
            doc_type="prd",
            title="Spec",
            content_md="new",
            status="final",
            version=2,
        )
    )
    await db_session.commit()

    read = await _read_document(ctx, {"project_id": proj.id, "ref": "Spec"})
    assert "new" in read.content
    assert "old" not in read.content


async def test_search_documents_escapes_like_wildcards(db_session, make_workspace_ctx):
    ctx, ws = make_workspace_ctx(db_session)
    proj = await _proj(db_session, ws.id)
    db_session.add(
        Artifact(
            project_id=proj.id,
            doc_type="prd",
            title="Discount Plan",
            content_md="Pricing details.",
            status="final",
        )
    )
    await db_session.commit()

    res = await _search_documents(ctx, {"project_id": proj.id, "query": "100%"})
    assert "Discount Plan" not in res.content


async def test_documents_are_project_scoped(db_session, make_workspace_ctx):
    """Tenant-safety: a document that lives in a different project must never be
    returned, even when queried through a workspace-matching ToolContext."""
    ctx, ws = make_workspace_ctx(db_session)
    proj = await _proj(db_session, ws.id)
    other_proj = await _proj(db_session, ws.id, identifier="P2")
    db_session.add(
        Artifact(
            project_id=other_proj.id,
            doc_type="prd",
            title="Other Project Doc",
            content_md="Secret plan.",
            status="final",
        )
    )
    await db_session.commit()

    res = await _search_documents(ctx, {"project_id": proj.id, "query": "Secret"})
    assert "Other Project Doc" not in res.content

    read = await _read_document(ctx, {"project_id": proj.id, "ref": "Other Project Doc"})
    assert "Secret plan." not in read.content and "No document matches" in read.content


async def test_read_document_accepts_a_doc_type_and_a_miss_is_not_an_error(
    db_session, make_workspace_ctx
):
    """GIN-478: the Situation block advertises DOC TYPES, so the model passes one
    as `ref` — resolve it. And a genuine miss is an empty result, not an error the
    agent should treat as a blocker."""
    ctx, ws = make_workspace_ctx(db_session)
    proj = await _proj(db_session, ws.id)
    db_session.add(
        Artifact(
            project_id=proj.id,
            doc_type="story_file",
            title="Checkout stories",
            content_md="As a buyer...",
            status="final",
        )
    )
    await db_session.commit()

    hit = await _read_document(ctx, {"project_id": proj.id, "ref": "story_file"})
    assert "As a buyer..." in hit.content and not hit.is_error

    miss = await _read_document(ctx, {"project_id": proj.id, "ref": "architecture"})
    assert not miss.is_error and "don't wait on a document" in miss.content
