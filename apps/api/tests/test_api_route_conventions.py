"""Every /api route ends with a trailing slash.

The frontend proxies through /api; a route without the trailing slash 502s there
while working fine when called gateway-direct, so the bug ships looking healthy.

Enumerate through the OpenAPI schema, not `app.routes`: FastAPI represents an
included router as a single `_IncludedRouter` object with no `.path`, so walking
`app.routes` sees ~79 entries and *zero* /api paths — a check written that way
passes vacuously no matter how many routes violate the rule.
"""

#: Pre-existing routes that predate this check. Each is reached directly rather
#: than through the frontend proxy, so the missing slash does not 502 today —
#: but none of them should be copied as a pattern, and nothing may be added here
#: without the same justification.
KNOWN_EXCEPTIONS = frozenset({
    "/api/projects/by-repo",  # MCP/agent lookup, not proxied
    "/api/webhooks/github/push",  # GitHub calls it directly; the URL is registered remotely
    "/api/workspaces/{workspace_slug}/stories/resolve/{code}",
    "/api/workspaces/{workspace_slug}/projects/{project_id}/stories/resolve/{code}",
})


def _api_paths(app) -> list[str]:
    return [p for p in app.openapi()["paths"] if p.startswith("/api")]


def test_the_check_actually_sees_the_routes(app):
    """Guards the guard: if this drops to zero the suite below proves nothing."""
    assert len(_api_paths(app)) > 300


def test_every_api_route_has_a_trailing_slash(app):
    offenders = [
        path
        for path in _api_paths(app)
        if not path.endswith("/") and path not in KNOWN_EXCEPTIONS
    ]
    assert offenders == []


def test_known_exceptions_are_all_real_routes(app):
    """A stale exception silently un-guards a route that was since fixed."""
    paths = set(_api_paths(app))
    assert KNOWN_EXCEPTIONS <= paths, KNOWN_EXCEPTIONS - paths
