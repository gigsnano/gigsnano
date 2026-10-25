"""Migration conventions that took production down once (2026-07-23).

An `sa.Enum` object handed to BOTH `.create()` and a `create_table()` column emits
CREATE TYPE twice. The second one raises `DuplicateObjectError`, alembic rolls the
*entire* upgrade back (it runs one transaction for the whole chain on Postgres),
and `entrypoint.sh` — which runs `alembic upgrade head` under `set -e` — leaves the
container dead. The API 503s on deploy with a clean database and no obvious cause.

Columns must reference an already-created type with
`postgresql.ENUM(..., create_type=False)`.
"""

import re
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations" / "versions"

_ENUM_DEF = re.compile(r"^(_\w+)\s*=\s*sa\.Enum\(", re.M)


def _create_table_text(source: str) -> str:
    """Just the `op.create_table(...)` calls. `add_column` with a pre-created enum
    is the established pattern here and applies cleanly — only create_table
    re-emits CREATE TYPE, so only it is checked."""
    blocks = []
    for start in (m.start() for m in re.finditer(r"op\.create_table\(", source)):
        depth, i = 0, source.index("(", start)
        for j in range(i, len(source)):
            if source[j] == "(":
                depth += 1
            elif source[j] == ")":
                depth -= 1
                if depth == 0:
                    blocks.append(source[start : j + 1])
                    break
    return "\n".join(blocks)


def enums_created_twice(source: str) -> list[str]:
    """Names of `sa.Enum` objects this migration both creates and uses as a
    create_table column type — the pairing that emits CREATE TYPE twice."""
    tables = _create_table_text(source)
    offenders = []
    for match in _ENUM_DEF.finditer(source):
        name = match.group(1)
        created = f"{name}.create(" in source or (
            re.search(r"for \w+ in \([^)]*\b" + re.escape(name) + r"\b", source, re.S) is not None
            and ".create(" in source
        )
        used_as_column = re.search(
            r"sa\.Column\([^)]*?\b" + re.escape(name) + r"\b\s*,", tables
        )
        if created and used_as_column:
            offenders.append(name)
    return offenders


# ── the detector itself, against the exact shapes that broke and that fixed it ──

BROKEN_DIRECT = '''
_STATUS = sa.Enum("open", "resolved", name="blocker_status")

def upgrade() -> None:
    _STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table("t", sa.Column("status", _STATUS, nullable=False))
'''

BROKEN_LOOP = '''
_A = sa.Enum("x", name="a")
_B = sa.Enum("y", name="b")

def upgrade() -> None:
    for enum in (_A, _B):
        enum.create(op.get_bind(), checkfirst=True)
    op.create_table("t", sa.Column("one", _A, nullable=False))
'''

FIXED = '''
_STATUS = sa.Enum("open", "resolved", name="blocker_status")
_STATUS_COL = postgresql.ENUM("open", "resolved", name="blocker_status", create_type=False)

def upgrade() -> None:
    _STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table("t", sa.Column("status", _STATUS_COL, nullable=False))
'''

ADD_COLUMN_ONLY = '''
_METHOD = sa.Enum("automatic", "simple", name="planning_method")

def upgrade() -> None:
    _METHOD.create(op.get_bind(), checkfirst=True)
    op.add_column("projects", sa.Column("planning_method", _METHOD, nullable=False))
'''


def test_detector_catches_the_direct_create_form():
    assert enums_created_twice(BROKEN_DIRECT) == ["_STATUS"]


def test_detector_catches_the_loop_create_form():
    """The form that actually shipped: `for enum in (...): enum.create(...)`."""
    assert enums_created_twice(BROKEN_LOOP) == ["_A"]


def test_detector_passes_the_create_type_false_form():
    assert enums_created_twice(FIXED) == []


def test_add_column_is_not_flagged():
    """`add_column` with a pre-created enum is the established pattern here and is
    fine — only `create_table` re-emits CREATE TYPE."""
    assert enums_created_twice(ADD_COLUMN_ONLY) == []


# ── and the real migrations ───────────────────────────────────────────────────

def test_no_migration_creates_an_enum_twice():
    offenders = {
        path.name: names
        for path in sorted(MIGRATIONS.glob("*.py"))
        if (names := enums_created_twice(path.read_text(encoding="utf-8", errors="replace")))
    }
    assert not offenders, (
        "These migrations pass an sa.Enum to both .create() and create_table(), which "
        "aborts `alembic upgrade head` on a real Postgres and takes the API down on "
        f"deploy: {offenders}. Use postgresql.ENUM(..., create_type=False) for columns."
    )
