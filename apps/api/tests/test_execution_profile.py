from gigsnano_api.features.skills import service as registry
from gigsnano_api.features.task_router.resolver import resolve_execution_profile
from gigsnano_api.models.skills import SkillPackage, SkillVersion

CORE = ["gigsnano-work-item-executor", "repo-context-loader", "verification-gate"]


def _skill_md(name: str) -> str:
    return f"---\nname: {name}\ndescription: {name}\n---\n"


async def _seed(db, ws, name, version="1.0.0"):
    return await registry.publish(
        db, workspace_id=ws, name=name, version=version, visibility="private",
        files={"SKILL.md": _skill_md(name)}, manifest={},
    )


async def test_design_task_resolves_core_and_design_skills(db_session, make_project):
    p = await make_project()
    for n in CORE + ["ui-ux-design"]:
        await _seed(db_session, p.workspace_id, n)
    prof = await resolve_execution_profile(
        db_session, p.workspace_id, "Refactor the button component design"
    )
    assert prof["classification"]["work_type"] == "design"
    by = {s["skillId"]: s for s in prof["skills"]}
    assert by["verification-gate"]["mode"] == "required"
    assert by["verification-gate"]["status"] == "pinned"
    assert by["ui-ux-design"]["mode"] == "recommended"
    assert by["ui-ux-design"]["status"] == "pinned"
    assert by["design-system-compliance"]["status"] == "unavailable"
    assert by["design-system-compliance"]["version"] is None
    assert prof["gates"] == ["design-review", "accessibility"]


async def test_resolution_is_deterministic(db_session, make_project):
    p = await make_project()
    for n in CORE:
        await _seed(db_session, p.workspace_id, n)
    a = await resolve_execution_profile(db_session, p.workspace_id, "Fix the checkout cart bug")
    b = await resolve_execution_profile(db_session, p.workspace_id, "Fix the checkout cart bug")
    assert a["skills"] == b["skills"]


async def test_unavailable_skill_does_not_fail(db_session, make_project):
    p = await make_project()  # seed nothing
    prof = await resolve_execution_profile(db_session, p.workspace_id, "Write E2E tests")
    assert prof["skills"]  # core entries still listed
    assert all(s["status"] == "unavailable" and s["version"] is None for s in prof["skills"])


async def test_platform_epic_classifies_platform_high_confidence(db_session, make_project):
    p = await make_project()
    text = (
        "Agent Skill Control Plane & Runtime — execution profile, MCP, runtime, "
        "cross-agent adapters, skill registry"
    )
    prof = await resolve_execution_profile(db_session, p.workspace_id, text)
    assert prof["classification"]["domains"] == ["platform"]
    assert prof["confidence"] == "high"


async def test_pins_highest_semver_not_lexical(db_session, make_project):
    p = await make_project()
    await _seed(db_session, p.workspace_id, "verification-gate", version="9.0.0")
    await _seed(db_session, p.workspace_id, "verification-gate", version="10.0.0")
    prof = await resolve_execution_profile(db_session, p.workspace_id, "Write E2E tests")
    vg = next(s for s in prof["skills"] if s["skillId"] == "verification-gate")
    assert vg["version"] == "10.0.0"  # numeric, not lexical ("10" < "9")


async def test_private_skill_shadows_public_deterministically(db_session, make_project):
    p = await make_project()
    priv = await _seed(db_session, p.workspace_id, "verification-gate")  # private, owned
    # A same-named public skill (different digest) must NOT win over the workspace's own.
    pub = SkillPackage(name="verification-gate", visibility="public", owner_workspace_id=None)
    db_session.add(pub)
    await db_session.flush()
    db_session.add(
        SkillVersion(
            package_id=pub.id, version="1.0.0", digest="sha256:PUBLIC",
            data=b"x", byte_size=1, manifest={}, lifecycle="approved",
        )
    )
    await db_session.flush()
    prof = await resolve_execution_profile(db_session, p.workspace_id, "Write E2E tests")
    vg = next(s for s in prof["skills"] if s["skillId"] == "verification-gate")
    assert vg["digest"] == priv.digest  # workspace-owned wins, not "sha256:PUBLIC"
