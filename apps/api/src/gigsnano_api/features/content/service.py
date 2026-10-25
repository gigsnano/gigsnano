from typing import Any

from gigsnano_api.content import doc_to_markdown, markdown_to_doc, validate_doc

from .schemas import ContentError, FromMarkdownOut, ToMarkdownOut


def _node_types(doc: Any) -> list[str]:
    """Multiset (as a sorted list) of every node `type` in the document tree."""
    out: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            t = node.get("type")
            if isinstance(t, str):
                out.append(t)
            for child in node.get("content") or []:
                walk(child)

    walk(doc)
    return out


def to_markdown(doc: dict[str, Any]) -> ToMarkdownOut:
    """Serialize canonical JSON -> Markdown, and self-check which node types are lost
    on a doc->md->doc round trip so the UI can warn before the user edits them."""
    markdown = doc_to_markdown(doc)
    roundtripped = validate_doc(markdown_to_doc(markdown))
    before: dict[str, int] = {}
    after: dict[str, int] = {}
    for t in _node_types(doc):
        before[t] = before.get(t, 0) + 1
    for t in _node_types(roundtripped):
        after[t] = after.get(t, 0) + 1
    lossy = sorted(t for t, n in before.items() if after.get(t, 0) < n)
    return ToMarkdownOut(markdown=markdown, lossy=lossy)


def from_markdown(text: str) -> FromMarkdownOut:
    """Parse Markdown -> canonical JSON. Never raises: a converter failure becomes a
    structured error so the client blocks the switch instead of losing the buffer."""
    try:
        doc = validate_doc(markdown_to_doc(text))
    except Exception as exc:  # noqa: BLE001 - any converter failure is a user-facing error
        return FromMarkdownOut(json=None, errors=[ContentError(message=str(exc))])
    return FromMarkdownOut(json=doc, errors=[])
