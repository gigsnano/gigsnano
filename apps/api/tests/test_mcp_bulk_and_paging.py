"""GIN-174: bulk fetch, real sub-item listing, and honest pagination.

These exist because an agent working GIN-160 hit all three: it fetched five codes
one at a time, listed a 177-item project and silently got 50, then *guessed* an
epic's children from the code sequence and pulled in an unrelated ticket.
"""

import importlib
import json
import pkgutil

import pytest

from gigsnano_api.mcp_server import tools
from gigsnano_api.mcp_server.api import ApiError


def _patch_everywhere(monkeypatch, name, value):
    """The tools live in per-domain submodules that each bound `api` /
    `default_workspace` / `resolve_ctx` at import, so the stub has to replace the
    name in every one of them — patching the package alone would miss them."""
    for info in pkgutil.iter_modules(tools.__path__):
        module = importlib.import_module(f"{tools.__name__}.{info.name}")
        if hasattr(module, name):
            monkeypatch.setattr(module, name, value)

STORY = {
    "id": "s1", "code": "GIN-1", "title": "T", "status": "todo",
    "priority": "high", "type": "story", "project_id": "p1", "assignee_id": None,
}


def raw(fn):
    """Unwrap the FastMCP tool to call the plain function."""
    return getattr(fn, "fn", fn)


@pytest.fixture
def stub(monkeypatch):
    """Route every API call through a recorder; tests set `responses` per path."""
    calls: list[tuple[str, str]] = []
    responses: dict = {}

    async def fake_api(method: str, path: str, body=None):
        calls.append((method, path))
        for key, value in responses.items():
            if key in path:
                if isinstance(value, Exception):
                    raise value
                return value
        raise AssertionError(f"unstubbed path: {path}")

    _patch_everywhere(monkeypatch, "api", fake_api)

    async def fake_default_workspace():
        return "gigsnano"

    async def fake_resolve_ctx(project):
        return "gigsnano", "p1"

    _patch_everywhere(monkeypatch, "default_workspace", fake_default_workspace)
    _patch_everywhere(monkeypatch, "resolve_ctx", fake_resolve_ctx)
    return type("Stub", (), {"calls": calls, "responses": responses})()


# --- fetch_work_items ---------------------------------------------------------


async def test_fetch_work_items_resolves_a_batch_in_one_call(stub):
    stub.responses["/stories/resolve/"] = STORY
    out = await raw(tools.fetch_work_items)(["GIN-1", "GIN-2"])

    assert len(out["items"]) == 2
    assert "errors" not in out  # omitted when everything resolved
    assert len(stub.calls) == 2


async def test_fetch_work_items_collapses_duplicate_codes(stub):
    stub.responses["/stories/resolve/"] = STORY
    await raw(tools.fetch_work_items)(["GIN-1", "GIN-1", "GIN-1"])
    assert len(stub.calls) == 1


async def test_fetch_work_items_reports_bad_codes_without_losing_good_ones(monkeypatch):
    async def fake_api(method, path, body=None):
        if "GIN-9" in path:
            raise ApiError(404, "Story not found")
        return STORY

    async def fake_default_workspace():
        return "gigsnano"

    _patch_everywhere(monkeypatch, "api", fake_api)
    _patch_everywhere(monkeypatch, "default_workspace", fake_default_workspace)

    out = await raw(tools.fetch_work_items)(["GIN-1", "GIN-9"])
    # The whole point: one typo must not discard the item that did resolve.
    assert [s["code"] for s in out["items"]] == ["GIN-1"]
    assert out["errors"][0]["code"] == "GIN-9"


async def test_fetch_work_items_bounds_the_batch(stub):
    with pytest.raises(ApiError):
        await raw(tools.fetch_work_items)([])
    with pytest.raises(ApiError):
        await raw(tools.fetch_work_items)(["GIN-1"] * 51)


# --- list_sub_work_items ------------------------------------------------------


async def test_list_sub_work_items_returns_real_children(stub):
    stub.responses["/stories/resolve/"] = {**STORY, "code": "GIN-160"}
    stub.responses["/sub-stories/"] = [
        {**STORY, "id": "s2", "code": "GIN-161", "title": "Backend"},
        {**STORY, "id": "s3", "code": "GIN-162", "title": "Frontend"},
    ]
    out = await raw(tools.list_sub_work_items)("GIN-160")

    assert out["parent"] == "GIN-160"
    assert out["count"] == 2
    assert [s["code"] for s in out["items"]] == ["GIN-161", "GIN-162"]


async def test_list_sub_work_items_reports_no_children_as_empty(stub):
    stub.responses["/stories/resolve/"] = STORY
    stub.responses["/sub-stories/"] = []
    out = await raw(tools.list_sub_work_items)("GIN-1")
    assert out == {"parent": "GIN-1", "count": 0, "items": []}


# --- list_work_items paging ---------------------------------------------------


async def test_list_work_items_flags_a_truncated_page(stub):
    # The API pages at 50. Returning a bare array of 50 out of 177 reads as
    # "that's the whole project" — the bug this fixes.
    stub.responses["/stories/"] = {"items": [STORY] * 50, "total": 177}
    out = await raw(tools.list_work_items)("gigsnano/p1")

    assert out["total"] == 177
    assert out["returned"] == 50
    assert out["truncated"] is True


async def test_list_work_items_is_not_truncated_when_page_covers_total(stub):
    stub.responses["/stories/"] = {"items": [STORY], "total": 1}
    out = await raw(tools.list_work_items)("gigsnano/p1")
    assert out["truncated"] is False


async def test_list_work_items_accounts_for_offset(stub):
    stub.responses["/stories/"] = {"items": [STORY], "total": 2}
    out = await raw(tools.list_work_items)("gigsnano/p1", offset=1)
    assert out["offset"] == 1
    assert out["truncated"] is False  # 1 + 1 == 2


async def test_list_work_items_url_encodes_the_search_term(stub):
    stub.responses["/stories/"] = {"items": [], "total": 0}
    await raw(tools.list_work_items)("gigsnano/p1", q="saved filters & views")
    _, path = stub.calls[0]
    # A raw f-string join would emit spaces and a bare & — a malformed URL.
    assert "q=saved+filters+%26+views" in path
    assert " " not in path


async def test_list_work_items_rejects_a_bad_page(stub):
    with pytest.raises(ApiError):
        await raw(tools.list_work_items)("gigsnano/p1", limit=0)
    with pytest.raises(ApiError):
        await raw(tools.list_work_items)("gigsnano/p1", limit=201)
    with pytest.raises(ApiError):
        await raw(tools.list_work_items)("gigsnano/p1", offset=-1)


# --- search_work_items (workspace-wide) ---------------------------------------


async def test_search_work_items_needs_no_project_id(stub):
    # The point: "does a ticket about X already exist anywhere?" can't be asked of
    # a project-scoped list. Nearly filed a duplicate epic for want of this.
    stub.responses["/stories/"] = {"items": [STORY], "total": 1}
    out = await raw(tools.search_work_items)("saved filters")
    assert out["total"] == 1
    method, path = stub.calls[0]
    assert path.startswith("/workspaces/gigsnano/stories/?")
    assert "q=saved+filters" in path


async def test_search_work_items_reports_truncation(stub):
    stub.responses["/stories/"] = {"items": [STORY] * 30, "total": 90}
    out = await raw(tools.search_work_items)("x", limit=30)
    assert out["truncated"] is True


async def test_search_work_items_rejects_a_bad_page(stub):
    with pytest.raises(ApiError):
        await raw(tools.search_work_items)("x", limit=999)


# --- summaries surface epics --------------------------------------------------


async def test_list_surfaces_sub_issue_count_so_epics_are_visible(stub):
    # Without this, spotting which rows have children costs a get_work_item each.
    stub.responses["/stories/"] = {
        "items": [{**STORY, "code": "GIN-160", "type": "epic", "sub_issue_count": 5}],
        "total": 1,
    }
    out = await raw(tools.list_work_items)("gigsnano/p1")
    assert out["items"][0]["sub_issue_count"] == 5
    assert out["items"][0]["type"] == "epic"


async def test_summary_omits_sub_issue_count_for_leaf_items(stub):
    stub.responses["/stories/"] = {"items": [{**STORY, "sub_issue_count": 0}], "total": 1}
    out = await raw(tools.list_work_items)("gigsnano/p1")
    assert "sub_issue_count" not in out["items"][0]
