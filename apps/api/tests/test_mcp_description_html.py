"""GIN-117 / GIN-134, re-pinned against the contract that replaced the sniffer.

Both bugs were the same shape: the MCP server guessed whether a rich-text field
held Markdown or HTML, and the guess was wrong in a way that showed raw source to
the user. GIN-117 patched the guess for descriptions; GIN-134 patched it again
for comments and narrowed the detector.

GIN-304 removed the guess. Tools now *state* the format and the API converts, so
`_rich_html` and the anchored-tag regex behind it are gone, and the tests that
exercised them went with it. The behavioural coverage — Markdown converting,
prose about markup not being misread, GFM tables working — now lives in
`test_content_contracts.py` against the real HTTP stack.

What remains here is the structural guarantee that made GIN-134 possible in the
first place: a rich-text path that forgets to declare its format.
"""

import inspect

import pytest

from gigsnano_api.mcp_server import tools


def _source_of(fn_name: str) -> str:
    fn = getattr(tools, fn_name)
    return inspect.getsource(getattr(fn, "fn", fn))


@pytest.mark.parametrize(
    "fn_name", ["start_work_item", "add_comment", "complete_work_item", "update_comment"]
)
def test_every_comment_path_declares_its_content_format(fn_name: str) -> None:
    """GIN-134's root cause was four call sites posting `{"body": ...}` raw.

    Asserted on the source, as the original test did, so a newly added comment
    path cannot quietly reintroduce it — the failure is silent, surfacing days
    later as literal `##` in someone's ticket.
    """
    assert '"content_format"' in _source_of(fn_name), (
        f"{fn_name} posts a comment body without stating its format"
    )


@pytest.mark.parametrize("fn_name", ["create_work_item", "update_work_item"])
def test_every_description_path_declares_its_content_format(fn_name: str) -> None:
    """The GIN-117 half."""
    assert '"content_format"' in _source_of(fn_name), (
        f"{fn_name} writes a description without stating its format"
    )


def test_the_sniffer_is_gone_rather_than_narrowed() -> None:
    """Two tickets narrowed this detector; the third fix was to delete it.

    If it returns, the bug class returns with it.
    """
    assert not hasattr(tools, "_rich_html")
    assert "markdown_or_html_to_html" not in inspect.getsource(tools)


def test_markdown_is_the_default_agents_get() -> None:
    """Models emit Markdown. Making that the stated default is what removes the
    guess, rather than relocating it to the caller."""
    assert tools.DEFAULT_CONTENT_FORMAT == "markdown"
