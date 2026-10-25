"""Fixed, code-defined privilege catalog — the single source of truth for staff
RBAC. Roles (DB rows) reference these keys; the Roles UI renders them as
assignable checkboxes. Never store privileges the catalog doesn't define."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Privilege:
    key: str
    group: str
    label: str


PRIVILEGES: list[Privilege] = [
    Privilege("dashboard.read", "Dashboard", "View the admin dashboard"),
    Privilege("users.read", "Users", "View all users"),
    Privilege("users.suspend", "Users", "Suspend users"),
    Privilege("users.manage", "Users", "Edit user profile and notification preferences"),
    Privilege("workspaces.read", "Workspaces", "View all workspaces"),
    Privilege("workspaces.delete", "Workspaces", "Delete workspaces"),
    Privilege("marketplace.moderate", "Marketplace", "Moderate marketplace listings"),
    Privilege("roles.read", "Roles", "View staff roles"),
    Privilege("roles.manage", "Roles", "Create, edit, and delete staff roles"),
    Privilege("staff.manage", "Staff", "Grant, change, and revoke staff access"),
    Privilege("audit.read", "Audit", "View the audit log"),
    Privilege("usage.read", "Usage", "View platform LLM token usage and cost analytics"),
    Privilege("notifications.read", "Notifications", "View notification templates"),
    Privilege(
        "notifications.manage",
        "Notifications",
        "Edit and reset notification templates",
    ),
    Privilege("billing.manage", "Billing", "Configure platform fee and billing settings"),
]

PRIVILEGE_KEYS: set[str] = {p.key for p in PRIVILEGES}
ALL_PRIVILEGES: list[str] = sorted(PRIVILEGE_KEYS)


def is_valid_privilege(key: str) -> bool:
    return key in PRIVILEGE_KEYS

