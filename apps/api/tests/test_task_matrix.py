from gigsnano_api.features.task_router.matrix import matrix_for


def test_design_matrix_core_required_and_design_recommended():
    entries, gates = matrix_for("design")
    by_name = {e["name"]: e for e in entries}
    assert by_name["gigsnano-work-item-executor"]["mode"] == "required"
    assert by_name["verification-gate"]["mode"] == "required"
    assert by_name["ui-ux-design"]["mode"] == "recommended"
    assert gates == ["design-review", "accessibility"]


def test_every_task_type_stays_within_cap():
    for tt in ("design", "docs", "architecture", "bug", "test", "feature", "unknown"):
        entries, _ = matrix_for(tt)
        assert len(entries) <= 6


def test_unknown_type_gets_core_only():
    entries, gates = matrix_for("nonsense")
    assert [e["name"] for e in entries] == [
        "gigsnano-work-item-executor",
        "repo-context-loader",
        "verification-gate",
    ]
    assert gates == []


def test_migration_wording_pins_the_migration_guardrail():
    # A migration classifies as "feature" and would otherwise route only frontend
    # skills — the signal layer is what reaches the rule that took prod down.
    entries, _ = matrix_for("feature", "Add an alembic migration for the status enum")
    by_name = {e["name"]: e for e in entries}
    assert by_name["database-migration-safety"]["mode"] == "recommended"
    assert by_name["database-migration-safety"]["order"] < by_name["frontend-implementation"]["order"]


def test_endpoint_wording_pins_tenant_isolation():
    entries, _ = matrix_for("feature", "New endpoint listing a project's members")
    assert "tenant-isolation" in {e["name"] for e in entries}


def test_no_signal_keeps_todays_behaviour():
    assert matrix_for("feature", "Tidy up the changelog") == matrix_for("feature")


def test_cap_holds_when_signal_and_type_both_match():
    entries, _ = matrix_for("bug", "Fix the migration that broke the members endpoint")
    names = [e["name"] for e in entries]
    assert len(entries) <= 6
    assert names[:3] == list(("gigsnano-work-item-executor", "repo-context-loader", "verification-gate"))
    # Signals win the contested slots; the type tail is what gets truncated.
    assert "database-migration-safety" in names and "tenant-isolation" in names
