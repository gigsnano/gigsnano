"""GIN-392: every tool declares whether it reads or writes.

Clients group the connection screen by `annotations.readOnlyHint`, so an
unclassified tool silently lands under "Write actions" — which is how ~70 pure
GETs came to be presented as mutations. These tests fail on a new tool that
nobody classified, and on a tool listed as read-only whose source mutates.
"""

import ast
import pathlib

import pytest

from gigsnano_api.mcp_server import tools  # noqa: F401 — registers the tool surface
from gigsnano_api.mcp_server.classification import DESTRUCTIVE, READ_ONLY
from gigsnano_api.mcp_server.server import mcp

_TOOLS_DIR = pathlib.Path(tools.__file__).parent
_MUTATING_VERBS = {"POST", "PATCH", "PUT", "DELETE"}


def _registered() -> dict:
    return mcp._tool_manager._tools


def _verbs_by_tool() -> dict[str, set[str]]:
    """The HTTP verbs each tool's own body passes to `api(...)`. Blind to calls made
    through a shared helper, so it can only prove a direct mutation — enough to
    catch a read-only misclassification at the call site."""
    found: dict[str, set[str]] = {}
    for path in _TOOLS_DIR.glob("*.py"):
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if not isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef):
                continue
            if not any(
                isinstance(d, ast.Call) and getattr(d.func, "attr", "") == "tool"
                for d in node.decorator_list
            ):
                continue
            found[node.name] = {
                n.args[0].value
                for n in ast.walk(node)
                if isinstance(n, ast.Call)
                and getattr(n.func, "id", "") == "api"
                and n.args
                and isinstance(n.args[0], ast.Constant)
            }
    return found


def test_every_tool_is_annotated():
    for name, tool in _registered().items():
        assert tool.annotations is not None, f"{name} has no annotations"
        assert tool.annotations.readOnlyHint is not None, f"{name} declares no readOnlyHint"
        assert tool.annotations.title, f"{name} has no human-readable title"


def test_read_and_write_groups_are_both_populated():
    hints = [t.annotations.readOnlyHint for t in _registered().values()]
    assert hints.count(True) > 50  # the read surface the connection screen was missing
    assert hints.count(False) > 0


def test_classified_names_all_exist():
    registered = set(_registered())
    assert READ_ONLY <= registered, READ_ONLY - registered
    assert DESTRUCTIVE <= registered, DESTRUCTIVE - registered
    assert not DESTRUCTIVE & READ_ONLY


@pytest.mark.parametrize("name", sorted(READ_ONLY))
def test_read_only_tools_issue_no_mutating_request(name):
    verbs = _verbs_by_tool().get(name, set())
    assert not verbs & _MUTATING_VERBS, f"{name} is classified read-only but calls {verbs}"


def test_deletes_are_flagged_destructive():
    for name, tool in _registered().items():
        if name.startswith("delete_"):
            assert tool.annotations.destructiveHint is True, name
