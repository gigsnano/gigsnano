import pytest

from gigsnano_api.features.skills import service as S

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n"
FILES = {"SKILL.md": SKILL_MD}


async def _publish(db, ws, version="1.0.0", files=FILES, visibility="private"):
    return await S.publish(
        db, workspace_id=ws, name="verification-gate", version=version,
        visibility=visibility, files=files, manifest={"risk": "low"},
    )


async def test_publish_returns_digest_and_draft(db_session, make_project):
    p = await make_project()
    v = await _publish(db_session, p.workspace_id)
    assert v.digest.startswith("sha256:")
    assert v.lifecycle == "draft"


async def test_republish_same_content_is_idempotent(db_session, make_project):
    p = await make_project()
    v1 = await _publish(db_session, p.workspace_id)
    v2 = await _publish(db_session, p.workspace_id)  # same version, same content
    assert v1.id == v2.id


async def test_republish_changed_content_new_version(db_session, make_project):
    p = await make_project()
    v1 = await _publish(db_session, p.workspace_id, version="1.0.0")
    v2 = await _publish(db_session, p.workspace_id, version="1.1.0",
                        files={"SKILL.md": SKILL_MD + "\nmore\n"})
    assert v1.digest != v2.digest


async def test_same_version_changed_content_conflicts(db_session, make_project):
    p = await make_project()
    await _publish(db_session, p.workspace_id, version="1.0.0")
    with pytest.raises(S.VersionConflict):
        await _publish(db_session, p.workspace_id, version="1.0.0",
                       files={"SKILL.md": SKILL_MD + "x"})


async def test_same_content_new_version_succeeds(db_session, make_project):
    """I1 regression: identical content published under a new version must not 500
    (the old uq_skill_ver_pkg_digest constraint made this an uncaught IntegrityError)."""
    p = await make_project()
    v1 = await _publish(db_session, p.workspace_id, version="1.0.0")
    v2 = await _publish(db_session, p.workspace_id, version="2.0.0")  # same content
    assert v1.id != v2.id
    assert v1.digest == v2.digest


async def test_private_is_tenant_isolated(db_session, make_project):
    a = await make_project()
    b = await make_project()  # different workspace
    await _publish(db_session, a.workspace_id)
    assert S_names(await S.list_visible(db_session, a.workspace_id)) == ["verification-gate"]
    assert S_names(await S.list_visible(db_session, b.workspace_id)) == []


async def test_revoke_blocks_runnable_but_deprecate_does_not(db_session, make_project):
    p = await make_project()
    v = await _publish(db_session, p.workspace_id)
    await S.transition(db_session, v.id, "reviewed")
    await S.transition(db_session, v.id, "approved")
    await S.transition(db_session, v.id, "deprecated")
    assert (await S.resolve_runnable(db_session, v.id)).id == v.id  # deprecated still runs
    await S.transition(db_session, v.id, "revoked")
    with pytest.raises(S.SkillRevoked):
        await S.resolve_runnable(db_session, v.id)


async def test_illegal_transition_rejected(db_session, make_project):
    p = await make_project()
    v = await _publish(db_session, p.workspace_id)
    with pytest.raises(ValueError):
        await S.transition(db_session, v.id, "approved")  # draft -> approved skips reviewed


def S_names(pkgs):
    return sorted(p.name for p in pkgs)
