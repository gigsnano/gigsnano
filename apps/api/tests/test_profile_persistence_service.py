import pytest

from gigsnano_api.features.execution_profiles import service as S
from gigsnano_api.features.skills import service as registry
from gigsnano_api.models.stories import Story

CORE = ["gigsnano-work-item-executor", "repo-context-loader", "verification-gate"]


def _skill_md(n):
    return f"---\nname: {n}\ndescription: {n}\n---\n"


async def _seed(db, ws, name, version="1.0.0"):
    return await registry.publish(db, workspace_id=ws, name=name, version=version,
                                  visibility="private", files={"SKILL.md": _skill_md(name)}, manifest={})


async def _story(db, p):
    s = Story(project_id=p.id, title="Fix the checkout cart bug")
    db.add(s)
    await db.flush()
    return s


async def test_persist_creates_and_preserves_overrides(db_session, make_project):
    p = await make_project()
    for n in CORE:
        await _seed(db_session, p.workspace_id, n)
    s = await _story(db_session, p)
    row = await S.resolve_and_persist(db_session, s, p.workspace_id, s.title, "claude-code")
    assert row.snapshot["classification"]["work_type"] == "bug"
    await S.apply_override(db_session, row, [{"skillId": "verification-gate", "mode": "prohibited"}], "n/a")
    row2 = await S.resolve_and_persist(db_session, s, p.workspace_id, s.title, "claude-code")  # re-resolve
    assert row2.overrides == {"verification-gate": {"mode": "prohibited"}}  # preserved across re-resolve
    eff = S.effective(row2.snapshot, row2.overrides)
    vg = next(sk for sk in eff["skills"] if sk["skillId"] == "verification-gate")
    assert vg["mode"] == "prohibited"


async def test_is_stale_on_registry_change(db_session, make_project):
    p = await make_project()
    for n in CORE:
        await _seed(db_session, p.workspace_id, n)
    s = await _story(db_session, p)
    row = await S.resolve_and_persist(db_session, s, p.workspace_id, s.title)
    assert await S.is_stale(db_session, row, p.workspace_id, s.title) is False
    await _seed(db_session, p.workspace_id, "verification-gate", version="2.0.0")  # new higher pin
    assert await S.is_stale(db_session, row, p.workspace_id, s.title) is True


async def test_removed_override_drops_skill(db_session, make_project):
    p = await make_project()
    for n in CORE:
        await _seed(db_session, p.workspace_id, n)
    s = await _story(db_session, p)
    row = await S.resolve_and_persist(db_session, s, p.workspace_id, s.title)
    await S.apply_override(db_session, row, [{"skillId": "repo-context-loader", "mode": "removed"}], "unneeded")
    eff = S.effective(row.snapshot, row.overrides)
    assert not any(sk["skillId"] == "repo-context-loader" for sk in eff["skills"])


async def test_locked_policy_rejects_override(db_session, make_project):
    p = await make_project()
    for n in CORE:
        await _seed(db_session, p.workspace_id, n)
    s = await _story(db_session, p)
    row = await S.resolve_and_persist(db_session, s, p.workspace_id, s.title, policy="locked")
    with pytest.raises(S.ProfileLocked):
        await S.apply_override(db_session, row, [{"skillId": "verification-gate", "mode": "removed"}], "x")
