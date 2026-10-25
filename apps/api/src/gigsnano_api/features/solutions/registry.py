"""Solution registry: validation + cohort-aware availability resolution."""

from gigsnano_api.features.solutions.cohort import is_solutions_cohort
from gigsnano_api.features.solutions.definitions import (
    BUILTIN_DEFINITIONS,
    REGISTRY_REVISION,
    SOFTWARE_DELIVERY_KEY,
    SOFTWARE_DELIVERY_VERSION,
)
from gigsnano_api.features.solutions.schemas import (
    SolutionDefinitionOut,
    SolutionRegistryOut,
)

KNOWN_CAPABILITIES = frozenset(
    {
        "journeys",
        "repositories",
        "domain_objects",
        "dashboards",
        "integrations",
        "agents",
    }
)

OUTSIDE_COHORT_REASON = "Solutions are not enabled for this workspace."

REQUIRED_FIELDS = (
    "key",
    "version",
    "name",
    "outcome",
    "description",
    "container_noun",
    "capabilities",
    "starting_points",
    "navigation",
    "availability",
)

__all__ = [
    "BUILTIN_DEFINITIONS",
    "KNOWN_CAPABILITIES",
    "OUTSIDE_COHORT_REASON",
    "REGISTRY_REVISION",
    "SOFTWARE_DELIVERY_KEY",
    "SOFTWARE_DELIVERY_VERSION",
    "build_registry",
    "validate_builtin_registry",
]


def validate_builtin_registry() -> list[str]:
    """Return human-readable problems with the built-in catalogue (empty = ok)."""
    problems: list[str] = []
    seen_keys: set[str] = set()

    if not REGISTRY_REVISION:
        problems.append("REGISTRY_REVISION must be a non-empty string")

    if not BUILTIN_DEFINITIONS:
        problems.append("BUILTIN_DEFINITIONS must not be empty")

    for solution in BUILTIN_DEFINITIONS:
        prefix = f"solution[{solution.key!r}]"

        for field in REQUIRED_FIELDS:
            value = getattr(solution, field, None)
            if value is None or value == "":
                problems.append(f"{prefix}: missing required field {field!r}")

        if solution.key in seen_keys:
            problems.append(f"duplicate solution key {solution.key!r}")
        else:
            seen_keys.add(solution.key)

        if not isinstance(solution.version, int) or solution.version < 1:
            problems.append(f"{prefix}: version must be a positive int")

        if solution.availability not in {"available", "disabled", "requires_permission"}:
            problems.append(
                f"{prefix}: unknown availability {solution.availability!r}"
            )

        if solution.availability != "available" and not solution.availability_reason:
            problems.append(
                f"{prefix}: non-available solutions require availability_reason"
            )

        if solution.availability == "available" and solution.availability_reason:
            problems.append(
                f"{prefix}: available solutions must not set availability_reason"
            )

        unknown_caps = set(solution.capabilities) - KNOWN_CAPABILITIES
        if unknown_caps:
            problems.append(
                f"{prefix}: unknown capabilities {sorted(unknown_caps)}"
            )

        if len(solution.capabilities) != len(set(solution.capabilities)):
            problems.append(f"{prefix}: duplicate capabilities")

        seen_sp: set[str] = set()
        for sp in solution.starting_points:
            if not sp.key:
                problems.append(f"{prefix}: starting_point missing key")
            elif sp.key in seen_sp:
                problems.append(f"{prefix}: duplicate starting_point key {sp.key!r}")
            else:
                seen_sp.add(sp.key)
            if sp.requires_capability is not None:
                if sp.requires_capability not in KNOWN_CAPABILITIES:
                    problems.append(
                        f"{prefix}: starting_point {sp.key!r} unknown "
                        f"requires_capability {sp.requires_capability!r}"
                    )
                elif sp.requires_capability not in solution.capabilities:
                    problems.append(
                        f"{prefix}: starting_point {sp.key!r} requires "
                        f"{sp.requires_capability!r} which the solution lacks"
                    )

        seen_nav: set[str] = set()
        for nav in solution.navigation:
            if not nav.key:
                problems.append(f"{prefix}: navigation entry missing key")
            elif nav.key in seen_nav:
                problems.append(f"{prefix}: duplicate navigation key {nav.key!r}")
            else:
                seen_nav.add(nav.key)
            if nav.requires_capability is not None:
                if nav.requires_capability not in KNOWN_CAPABILITIES:
                    problems.append(
                        f"{prefix}: navigation {nav.key!r} unknown "
                        f"requires_capability {nav.requires_capability!r}"
                    )
                elif nav.requires_capability not in solution.capabilities:
                    problems.append(
                        f"{prefix}: navigation {nav.key!r} requires "
                        f"{nav.requires_capability!r} which the solution lacks"
                    )

    if SOFTWARE_DELIVERY_KEY not in seen_keys:
        problems.append(f"missing required solution {SOFTWARE_DELIVERY_KEY!r}")
    else:
        sd = next(s for s in BUILTIN_DEFINITIONS if s.key == SOFTWARE_DELIVERY_KEY)
        if sd.version != SOFTWARE_DELIVERY_VERSION:
            problems.append(
                f"solution[{SOFTWARE_DELIVERY_KEY!r}]: version must be "
                f"{SOFTWARE_DELIVERY_VERSION}, got {sd.version!r}"
            )

    return problems


def build_registry(workspace_slug: str) -> SolutionRegistryOut:
    """Return the catalogue with availability resolved for ``workspace_slug``."""
    in_cohort = is_solutions_cohort(workspace_slug)
    solutions: list[SolutionDefinitionOut] = []
    for definition in BUILTIN_DEFINITIONS:
        if in_cohort:
            solutions.append(definition.model_copy())
        else:
            solutions.append(
                definition.model_copy(
                    update={
                        "availability": "disabled",
                        "availability_reason": OUTSIDE_COHORT_REASON,
                    }
                )
            )
    return SolutionRegistryOut(revision=REGISTRY_REVISION, solutions=solutions)
