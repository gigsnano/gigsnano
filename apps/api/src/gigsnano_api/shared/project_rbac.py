"""Project-scoped RBAC: the authoritative permission matrix (GIN-318/GIN-319).

This module is the single source of truth the enforcement layer (GIN-323), the
UI (GIN-320/321) and the tests (GIN-322) all reference. Project roles are separate
from workspace roles; workspace Owner/Admin have a documented governance override.

Security invariants encoded here:
- OWNER ⊃ ADMIN ⊃ MEMBER ⊃ VIEWER (strict capability superset).
- Only OWNER may transfer ownership or delete the project.
- Members manage delivery (work items/comments/docs), not project configuration.
- Viewers are read-only.
Enforcement is server-side; the UI mirrors this but is never the boundary.
"""
from __future__ import annotations

import enum

from gigsnano_api.models import EProjectRole, EWorkspaceRole


class EProjectPermission(str, enum.Enum):
    """Actions a project role may perform. Grouped to the epic's resource list."""

    VIEW = "view"  # read project content
    DELIVER = "deliver"  # work items, comments, documents, relations, attachments
    MANAGE_SETTINGS = "manage_settings"  # metadata, states, workflow, labels, estimates,
    #                                      custom fields, features, automations, cycles/modules
    MANAGE_MEMBERS = "manage_members"  # invite/remove members, change roles (not ownership)
    TRANSFER_OWNERSHIP = "transfer_ownership"
    DELETE_PROJECT = "delete_project"


# Role → the permissions it grants. Each higher role is a strict superset (verified
# in tests) so a capability check can never let a lower role exceed a higher one.
_VIEWER: frozenset[EProjectPermission] = frozenset({EProjectPermission.VIEW})
_MEMBER = _VIEWER | {EProjectPermission.DELIVER}
_ADMIN = _MEMBER | {EProjectPermission.MANAGE_SETTINGS, EProjectPermission.MANAGE_MEMBERS}
_OWNER = _ADMIN | {EProjectPermission.TRANSFER_OWNERSHIP, EProjectPermission.DELETE_PROJECT}

ROLE_PERMISSIONS: dict[EProjectRole, frozenset[EProjectPermission]] = {
    EProjectRole.VIEWER: frozenset(_VIEWER),
    EProjectRole.MEMBER: frozenset(_MEMBER),
    EProjectRole.ADMIN: frozenset(_ADMIN),
    EProjectRole.OWNER: frozenset(_OWNER),
}

# Workspace Owner/Admin get a governance override: full project authority for
# recovery/administration, treated as project OWNER-equivalent. Documented and
# audited (GIN-318 "workspace recovery policy"); this preserves the historical
# ADMINS bypass rather than silently flattening project roles.
WORKSPACE_GOVERNANCE_ROLES = (EWorkspaceRole.OWNER, EWorkspaceRole.ADMIN)

# Role rank for hierarchy checks — a user cannot grant a role above their own, and
# the last OWNER cannot be demoted/removed (enforced in the member service).
ROLE_RANK: dict[EProjectRole, int] = {
    EProjectRole.VIEWER: 0,
    EProjectRole.MEMBER: 1,
    EProjectRole.ADMIN: 2,
    EProjectRole.OWNER: 3,
}


def has_project_permission(role: EProjectRole, permission: EProjectPermission) -> bool:
    """True if `role` grants `permission`. Unknown roles grant nothing (fail closed)."""
    return permission in ROLE_PERMISSIONS.get(role, frozenset())


def effective_permissions(
    workspace_role: EWorkspaceRole, project_role: EProjectRole | None
) -> frozenset[EProjectPermission]:
    """The permissions a caller effectively holds on a project.

    Workspace Owner/Admin get the full OWNER set (governance override). Otherwise a
    caller has exactly their project role's permissions, or none if not a member.
    """
    if workspace_role in WORKSPACE_GOVERNANCE_ROLES:
        return ROLE_PERMISSIONS[EProjectRole.OWNER]
    if project_role is None:
        return frozenset()
    return ROLE_PERMISSIONS[project_role]


def can(
    workspace_role: EWorkspaceRole,
    project_role: EProjectRole | None,
    permission: EProjectPermission,
) -> bool:
    """Effective allow/deny for one action — the check the enforcement layer calls."""
    return permission in effective_permissions(workspace_role, project_role)
