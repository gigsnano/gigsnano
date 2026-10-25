"""Which widgets may appear on a publicly shared dashboard (GIN-489).

Publishing is opt-in per dashboard, but the widget catalogue is not uniformly
safe to expose: some widgets are scoped to the viewer ("assigned to me"), some
name individuals ("team workload", "activity by person"), and some print raw
work-item titles and descriptions ("work item list", "risk list", the activity
feed). An anonymous visitor gets none of those.

What remains is aggregate: counts by status/priority/label, headline numbers,
sprint progress and per-day flow. Ineligible widgets are excluded from the
public payload rather than silently rendered, and the owner is told which ones
before publishing.

This list is the server-side authority. `src/components/dashboards/widgets/
widget-registry.tsx` mirrors it for the pre-publish warning; keep the two in
step when a widget type is added.
"""

import secrets


def new_public_token() -> str:
    """A fresh share token: 32 random bytes, URL-safe. The token is the entire
    access credential, so it must be unguessable — never derive it from the
    dashboard id."""
    return secrets.token_urlsafe(32)


# Values are EDashboardWidgetType from the frontend contract.
PUBLIC_ELIGIBLE_WIDGET_TYPES = frozenset(
    {
        "status_chart",
        "status_donut",
        "priority_breakdown",
        "counter",
        "kpi",
        "labels",
        "daily_activity",
        "planned_workload",
        "sprint_status",
        "velocity",
        "introduction",
    }
)

# Settings safe to hand an anonymous viewer: they change how a widget draws
# itself, never what it is scoped to. Project/assignee filters stay server-side
# (see public.py) so a visitor can neither read nor widen them.
PUBLIC_SAFE_SETTING_KEYS = frozenset(
    {"metric", "group_by", "date_range", "date_from", "date_to", "text", "limit"}
)


def public_widgets(config: dict) -> list[dict]:
    """The widgets of `config` an anonymous visitor may see, in board order."""
    widgets = config.get("widgets") or []
    return [w for w in widgets if w.get("type") in PUBLIC_ELIGIBLE_WIDGET_TYPES]


def blocked_widget_types(config: dict) -> list[str]:
    """Distinct ineligible widget types on the board, for the owner's warning."""
    seen: list[str] = []
    for widget in config.get("widgets") or []:
        kind = widget.get("type")
        if kind not in PUBLIC_ELIGIBLE_WIDGET_TYPES and kind not in seen:
            seen.append(kind)
    return seen
