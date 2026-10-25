"""Stack compatibility checks for the granular composer (GIN-225).
ponytail: a small curated rules set with real teeth (DB<->architecture fit,
mutually-exclusive frameworks); grow the tables as the composer adds layers."""

# Mutually-exclusive picks — having both in the allowed set is incoherent.
_MUTUALLY_EXCLUSIVE = [
    ("next", "vite"),
]

# Architectures that fit each database engine. A missing engine => unknown, skip.
_DB_ARCHITECTURES: dict[str, set[str]] = {
    "postgres": {"normalized", "star", "denormalized"},
    "postgresql": {"normalized", "star", "denormalized"},
    "mysql": {"normalized", "star", "denormalized"},
    "mariadb": {"normalized", "star", "denormalized"},
    "sqlite": {"normalized", "denormalized"},
    "mongodb": {"document", "denormalized"},
    "dynamodb": {"document", "denormalized"},
    "cassandra": {"document", "denormalized"},
    "neo4j": {"graph"},
    "falkordb": {"graph"},
    "redis": {"keyvalue"},
    "eventstoredb": {"cqrs", "event-sourced"},
}


def check_compatibility(
    allowed_libraries: list[str], database: str | None, architecture: str | None
) -> list[str]:
    """Return blocking conflict messages for a composed stack (empty = coherent)."""
    conflicts: list[str] = []
    libs = {lib.strip().lower() for lib in allowed_libraries}
    for a, b in _MUTUALLY_EXCLUSIVE:
        if a in libs and b in libs:
            conflicts.append(f'"{a}" and "{b}" are mutually exclusive — pick one framework')
    if database and architecture:
        allowed = _DB_ARCHITECTURES.get(database.strip().lower())
        if allowed is not None and architecture.strip().lower() not in allowed:
            conflicts.append(
                f'architecture "{architecture}" does not fit "{database}" '
                f"(fits: {', '.join(sorted(allowed))})"
            )
    return conflicts
