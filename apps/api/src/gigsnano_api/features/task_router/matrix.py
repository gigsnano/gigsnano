"""Task -> skill routing matrix (GIN-287). Maps a classified work item to the
skills a run should load, their mode + order, and the gates to run. Pure data —
the resolver pins these names to immutable registry versions.

ponytail: named ceiling — the type dimension is keyed on task_type alone because
the classifier has no layer signal; refine (design-only vs design+code) when a
layer classifier exists."""

from gigsnano_api.features.task_router.classifier import _hits as _keyword_hits

# Always loaded for an implementation run (the epic's core trio).
_CORE: tuple[str, ...] = (
    "gigsnano-work-item-executor",
    "repo-context-loader",
    "verification-gate",
)

# Conditional skills keyed by classified task_type (the epic's routing catalogue).
_BY_TYPE: dict[str, tuple[str, ...]] = {
    "design": ("ui-ux-design", "design-system-compliance", "accessibility-review"),
    "docs": ("technical-writing", "documentation-verification"),
    "architecture": ("architecture-review", "safe-refactor"),
    "bug": ("root-cause-debugging", "regression-test"),
    "test": ("regression-test",),
    "feature": ("frontend-implementation", "api-design"),
}

# Guardrail skills keyed by what the work item *touches*, independent of its type.
# A migration classifies as "feature" and would otherwise route frontend skills,
# so type alone cannot reach the rules whose absence has cost prod downtime.
#
# ponytail: named ceiling — keyword matching, so a migration described without a
# listed word does not trigger. Upgrade path: match on the run's changed file
# paths once a run can see its own diff.
_BY_SIGNAL: dict[str, tuple[str, ...]] = {
    "database-migration-safety": (
        "migration", "alembic", "schema change", "column", "enum", "constraint", "index",
    ),
    "tenant-isolation": (
        "endpoint", "router", "route", "permission", "access control", "rbac",
        "workspace", "tenant", "project member",
    ),
}

# Required checkpoints keyed by task_type.
_GATES: dict[str, tuple[str, ...]] = {
    "design": ("design-review", "accessibility"),
    "architecture": ("architecture-review",),
    "docs": ("documentation-verification",),
    "test": ("verification-gate",),
    "bug": ("regression-test",),
    "feature": ("verification-gate",),
}

#: The active set stays small enough to actually be read (the epic's cap).
MAX_ACTIVE = 6


def matrix_for(task_type: str, text: str = "") -> tuple[list[dict], list[str]]:
    """Return (skill entries, gates) for a task type and its work-item text.

    Core skills are 'required' (order 0,10,20); conditional skills 'recommended'.
    Signal matches order ahead of type matches — "this touches a migration" is
    harder evidence than "this reads like a feature" — and the recommended tail
    is truncated so the active set never exceeds MAX_ACTIVE.
    """
    entries = [
        {"name": name, "mode": "required", "order": i * 10}
        for i, name in enumerate(_CORE)
    ]

    signalled = [
        name for name, keywords in _BY_SIGNAL.items() if _keyword_hits(text, keywords)
    ]
    entries += [
        {"name": name, "mode": "recommended", "order": 50 + i * 10}
        for i, name in enumerate(signalled)
    ]
    entries += [
        {"name": name, "mode": "recommended", "order": 100 + i * 10}
        for i, name in enumerate(_BY_TYPE.get(task_type, ()))
        if name not in signalled
    ]
    return entries[:MAX_ACTIVE], list(_GATES.get(task_type, ()))
