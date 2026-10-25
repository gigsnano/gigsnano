"""Validation for a View's `filter_query` (GigsQL, GIN-166/175/138).

Canonical Plane/Jira-style GigsQL with AND/OR, operators, and parentheses.
GIN-166 colon shorthand is accepted and normalized on save.
Kept in step with `src/lib/views/gigsql.ts` on the frontend.
"""

from gigsnano_api.features.views.gigsql import normalize_gigsql

FIELDS = (
    "cycle",
    "module",
    "assignee",
    "status",
    "priority",
    "title",
    "label",
    "dueDate",
    "createdAt",
    "startDate",
    "updatedAt",
    "type",
)


def validate_filter_query(query: str | None) -> str:
    return normalize_gigsql(query)
