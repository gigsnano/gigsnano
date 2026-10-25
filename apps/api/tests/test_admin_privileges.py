from gigsnano_api.admin.privileges import (
    ALL_PRIVILEGES,
    PRIVILEGE_KEYS,
    PRIVILEGES,
    is_valid_privilege,
)

EXPECTED = {
    "dashboard.read", "users.read", "users.suspend", "users.manage", "workspaces.read",
    "workspaces.delete", "marketplace.moderate", "roles.read", "roles.manage",
    "staff.manage", "audit.read", "usage.read",
    "notifications.read", "notifications.manage", "billing.manage",
}


def test_catalog_keys_match_spec():
    assert PRIVILEGE_KEYS == EXPECTED


def test_all_privileges_is_sorted_unique():
    assert ALL_PRIVILEGES == sorted(EXPECTED)
    assert len(ALL_PRIVILEGES) == len(set(ALL_PRIVILEGES))


def test_every_privilege_has_group_and_label():
    for p in PRIVILEGES:
        assert p.key in EXPECTED
        assert p.group and p.label


def test_is_valid_privilege():
    assert is_valid_privilege("roles.manage")
    assert not is_valid_privilege("roles.bogus")
