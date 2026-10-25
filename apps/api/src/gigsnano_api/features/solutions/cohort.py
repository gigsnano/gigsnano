from gigsnano_api.core.config import settings


def is_solutions_cohort(workspace_slug: str) -> bool:
    if not settings.solutions_enabled:
        return False
    allowed = {
        part.strip()
        for part in settings.solution_workspace_allowlist.split(",")
        if part.strip()
    }
    # An empty allowlist means the flag alone enables every workspace; a
    # non-empty allowlist narrows the rollout to those slugs.
    if not allowed:
        return True
    return workspace_slug in allowed
