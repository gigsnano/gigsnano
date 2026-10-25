"""A fresh database must migrate from zero: no column may be added by two revisions.

Autogenerate against a stale dev DB once re-emitted `artifacts.file_name` in a later
revision; production never noticed (its DB was upgraded step by step) but every
self-hosted `alembic upgrade head` on an empty Postgres failed with DuplicateColumn.
"""
import ast
from collections import defaultdict
from pathlib import Path

VERSIONS = Path(__file__).resolve().parent.parent / "migrations" / "versions"


def _str(node: ast.AST) -> str | None:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def _added_columns(tree: ast.Module) -> list[tuple[str, str]]:
    upgrade = next(
        (n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "upgrade"), None
    )
    if upgrade is None:
        return []
    found = []
    for call in ast.walk(upgrade):
        if not (isinstance(call, ast.Call) and getattr(call.func, "attr", None) == "add_column"):
            continue
        if len(call.args) < 2 or not isinstance(call.args[1], ast.Call) or not call.args[1].args:
            continue
        table, column = _str(call.args[0]), _str(call.args[1].args[0])
        if table and column:
            found.append((table, column))
    return found


def test_no_column_is_added_by_two_migrations():
    owners: dict[tuple[str, str], list[str]] = defaultdict(list)
    for path in sorted(VERSIONS.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for key in _added_columns(tree):
            owners[key].append(path.name)
    duplicates = {f"{t}.{c}": files for (t, c), files in owners.items() if len(files) > 1}
    assert duplicates == {}
