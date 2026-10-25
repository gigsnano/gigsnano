import json

import pytest

from gigsnano_api.features.skills import bundle, materialize as M
from gigsnano_api.features.skills import service as S

SKILL_MD = "---\nname: verification-gate\ndescription: checks\n---\n"
FILES = {"SKILL.md": SKILL_MD}


@pytest.fixture
def workspace_tmp(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "gigsnano_api.workspace.paths.settings.workspace_base_path", str(tmp_path)
    )
    return tmp_path


async def _publish(db, ws, files=FILES, manifest=None):
    return await S.publish(
        db, workspace_id=ws, name="verification-gate", version="1.0.0",
        visibility="private", files=files, manifest=manifest or {"risk": "low"},
    )


@pytest.mark.parametrize("agent,expected", [
    ("claude-code", ".claude/skills/verification-gate"),
    ("codex", ".agents/skills/verification-gate"),
    ("cursor", ".agents/skills/verification-gate"),
])
async def test_materialize_writes_to_adapter_path_and_matches_digest(
    db_session, make_project, workspace_tmp, agent, expected
):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id)
    contract = await M.materialize(db_session, p.id, agent, [ver.id], run_id="run1")

    from gigsnano_api.workspace.paths import workspace_root
    root = workspace_root(p.id)
    skill_dir = root / expected
    assert (skill_dir / "SKILL.md").read_text(encoding="utf-8") == SKILL_MD
    # read back from disk -> digest matches the recorded digest
    read_back = {"SKILL.md": (skill_dir / "SKILL.md").read_text(encoding="utf-8")}
    assert bundle.content_digest(read_back) == ver.digest
    assert contract.skills[0].path == expected
    assert contract.activated == ["verification-gate"]


async def test_cursor_gets_exactly_one_copy(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id)
    await M.materialize(db_session, p.id, "cursor", [ver.id], run_id="run1")
    from gigsnano_api.workspace.paths import workspace_root
    root = workspace_root(p.id)
    assert (root / ".agents/skills/verification-gate/SKILL.md").exists()
    assert not (root / ".claude").exists()  # no second adapter dir
    assert not (root / ".cursor").exists()


async def test_revoked_blocks_and_writes_nothing(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id)
    for step in ("reviewed", "approved", "revoked"):
        await S.transition(db_session, ver.id, step)
    with pytest.raises(S.SkillRevoked):
        await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")
    from gigsnano_api.workspace.paths import workspace_root
    assert not (workspace_root(p.id) / ".claude").exists()


async def test_missing_version_blocks(db_session, make_project, workspace_tmp):
    p = await make_project()
    with pytest.raises(LookupError):
        await M.materialize(db_session, p.id, "claude-code", ["nope"], run_id="run1")


async def test_digest_mismatch_blocks(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id)
    # Corrupt the stored bundle bytes so the recomputed digest no longer matches.
    ver.data = bundle.build_tgz({"SKILL.md": "tampered\n"})
    await db_session.flush()
    with pytest.raises(M.DigestMismatch):
        await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")
    from gigsnano_api.workspace.paths import workspace_root
    assert not (workspace_root(p.id) / ".claude").exists()


async def test_declared_incompatible_agent_blocks(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id, manifest={"agents": ["codex"]})
    with pytest.raises(M.IncompatibleAgent):
        await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")


async def test_conflict_with_committed_skill_preserves_it(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id)
    from gigsnano_api.workspace.paths import workspace_root
    root = workspace_root(p.id)
    committed = root / ".claude/skills/verification-gate"
    committed.mkdir(parents=True)
    (committed / "SKILL.md").write_text("COMMITTED", encoding="utf-8")
    with pytest.raises(M.SkillConflict):
        await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")
    assert (committed / "SKILL.md").read_text(encoding="utf-8") == "COMMITTED"


async def test_manifest_records_written_paths(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id)
    await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")
    from gigsnano_api.workspace.paths import workspace_root
    mpath = workspace_root(p.id) / ".gigsnano/materialized/run1.json"
    assert json.loads(mpath.read_text(encoding="utf-8")) == [".claude/skills/verification-gate"]


async def test_bundle_path_traversal_is_blocked(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(
        db_session, p.workspace_id,
        files={"SKILL.md": SKILL_MD, "../../evil.txt": "pwned"},
    )
    with pytest.raises(ValueError):
        await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")
    from gigsnano_api.workspace.paths import workspace_root
    root = workspace_root(p.id)
    escape_target = (root / ".claude/skills/verification-gate/../../evil.txt").resolve()
    assert not escape_target.exists()
    assert not (root / ".claude/skills/verification-gate").exists()


async def test_cross_tenant_revoked_version_is_missing_not_revoked(db_session, make_project, workspace_tmp):
    a = await make_project()
    ver = await _publish(db_session, a.workspace_id)
    for step in ("reviewed", "approved", "revoked"):
        await S.transition(db_session, ver.id, step)
    b = await make_project()
    with pytest.raises(LookupError):
        await M.materialize(db_session, b.id, "claude-code", [ver.id], run_id="r")


async def test_string_compat_declaration_is_honored(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id, manifest={"agents": "codex"})
    with pytest.raises(M.IncompatibleAgent):
        await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")


async def test_cleanup_is_surgical_and_idempotent(db_session, make_project, workspace_tmp):
    p = await make_project()
    ver = await _publish(db_session, p.workspace_id)
    from gigsnano_api.workspace.paths import workspace_root
    root = workspace_root(p.id)

    # A committed project-owned sibling skill and a repo file that must survive.
    sibling = root / ".claude/skills/committed-helper"
    sibling.mkdir(parents=True)
    (sibling / "SKILL.md").write_text("COMMITTED", encoding="utf-8")
    (root / "README.md").write_text("repo", encoding="utf-8")

    await M.materialize(db_session, p.id, "claude-code", [ver.id], run_id="run1")
    assert (root / ".claude/skills/verification-gate/SKILL.md").exists()

    M.cleanup(p.id, "run1")
    assert not (root / ".claude/skills/verification-gate").exists()   # ours: gone
    assert not (root / ".gigsnano/materialized/run1.json").exists()   # manifest: gone
    assert (sibling / "SKILL.md").read_text(encoding="utf-8") == "COMMITTED"  # committed: kept
    assert (root / "README.md").read_text(encoding="utf-8") == "repo"         # repo: kept

    M.cleanup(p.id, "run1")  # idempotent no-op (no manifest)
