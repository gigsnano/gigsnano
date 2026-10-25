import hashlib
import hmac

from gigsnano_api.context_engine.webhook import projects_for_push, ref_branch, verify_signature
from gigsnano_api.models import Project


def test_verify_signature_roundtrip():
    secret, body = "s3cret", b'{"a":1}'
    good = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_signature(secret, body, good) is True
    assert verify_signature(secret, body, "sha256=deadbeef") is False
    assert verify_signature(secret, body, None) is False  # fail-closed


def test_ref_branch_parses_heads():
    assert ref_branch("refs/heads/main") == "main"
    assert ref_branch("refs/tags/v1") is None  # not a branch push


async def test_projects_for_push_matches_repo_and_branch(db_session):
    p = Project(workspace_id="w", name="P", identifier="P1",
                cover_image_url="https://img.test/c.jpg",
                repo_full_name="acme/app", repo_default_branch="main")
    db_session.add(p)
    await db_session.commit()
    ids = await projects_for_push(db_session, "acme/app", "refs/heads/main")
    assert ids == [p.id]
    assert await projects_for_push(db_session, "acme/app", "refs/heads/dev") == []
