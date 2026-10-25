from gigsnano_api.features.skills import service as registry
from gigsnano_api.features.skills.seed import seed_skills
from gigsnano_api.features.task_router.resolver import resolve_execution_profile

_EXPECTED = {
    "gigsnano-work-item-executor", "repo-context-loader", "verification-gate",
    "ui-ux-design", "design-system-compliance", "accessibility-review",
    "technical-writing", "documentation-verification",
    "architecture-review", "safe-refactor",
    "root-cause-debugging", "regression-test",
    "frontend-implementation", "api-design",
    "database-migration-safety", "tenant-isolation",
}


async def test_seed_publishes_all_public_and_is_idempotent(db_session, make_project):
    p = await make_project()
    await seed_skills(db_session)
    names = {pkg.name for pkg in await registry.list_visible(db_session, p.workspace_id)}
    assert _EXPECTED <= names  # every matrix-referenced skill was seeded, public
    count = len(await registry.list_visible(db_session, p.workspace_id))
    await seed_skills(db_session)  # re-seed
    assert len(await registry.list_visible(db_session, p.workspace_id)) == count  # idempotent


async def test_resolver_pins_seeded_design_skills(db_session, make_project):
    p = await make_project()
    await seed_skills(db_session)
    prof = await resolve_execution_profile(
        db_session, p.workspace_id, "Refactor the button component design"
    )
    by = {s["skillId"]: s for s in prof["skills"]}
    assert by["verification-gate"]["status"] == "pinned"  # core, real bundle
    assert by["ui-ux-design"]["status"] == "pinned"
    assert by["ui-ux-design"]["digest"].startswith("sha256:")
    assert "frontend-implementation" not in by  # design-only does not load frontend impl
    assert len(prof["skills"]) <= 6  # active set stays small (3 core + 3 design)
