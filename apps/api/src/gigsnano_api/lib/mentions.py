"""Extract @-mentions from story/doc text and resolve to workspace member user ids."""

import re
from html import unescape
from html.parser import HTMLParser

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import EMemberStatus, ProjectMember, User, WorkspaceMember

_TAG_RE = re.compile(r"<[^>]+>")


def _plain_text(text: str) -> str:
    return unescape(_TAG_RE.sub(" ", text or ""))


class _MentionComponentParser(HTMLParser):
    """Collect user ids from Plane-style `<mention-component>` tags."""

    def __init__(self) -> None:
        super().__init__()
        self.user_ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "mention-component":
            return
        attr_map = {k: v for k, v in attrs if v is not None}
        if attr_map.get("entity_name") != "user_mention":
            return
        user_id = attr_map.get("entity_identifier")
        if user_id:
            self.user_ids.add(user_id)


def extract_mention_user_ids_from_html(text: str) -> set[str]:
    """Return user UUIDs referenced by `<mention-component entity_name=\"user_mention\">`."""
    if not text or "mention-component" not in text:
        return set()
    parser = _MentionComponentParser()
    parser.feed(text)
    return parser.user_ids


def extract_mention_names(text: str, *, catalog: set[str] | None = None) -> set[str]:
    """Return display names referenced as @Name in plain text.

    When `catalog` is provided, only names present in the catalog are returned
    (longest-prefix match at each `@`).
    """
    plain = _plain_text(text)
    if not plain or "@" not in plain:
        return set()

    if catalog is None:
        # Fallback: single-token mentions only (tests / no directory).
        return {m.group(1) for m in re.finditer(r"@([\w.-]+)", plain)}

    names: set[str] = set()
    by_len = sorted(catalog, key=len, reverse=True)
    for i, ch in enumerate(plain):
        if ch != "@":
            continue
        rest = plain[i + 1 :]
        for name in by_len:
            if rest.casefold().startswith(name.casefold()):
                tail = rest[len(name) : len(name) + 1]
                if tail and (tail.isalnum() or tail in "._-"):
                    continue
                names.add(name)
                break
    return names


async def _project_member_names(
    db: AsyncSession, workspace_id: str, project_id: str
) -> dict[str, str]:
    rows = (
        await db.execute(
            select(User.id, User.display_name)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
                ProjectMember.project_id == project_id,
                ProjectMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).all()
    return {display_name: user_id for user_id, display_name in rows}


async def resolve_mention_user_ids(
    db: AsyncSession,
    workspace_id: str,
    project_id: str,
    text: str,
) -> set[str]:
    """Map mentions to active project member user ids.

    Prefer Plane-style `<mention-component entity_identifier=\"…\">` nodes;
    fall back to legacy `@display_name` plain-text tokens.
    """
    html_ids = extract_mention_user_ids_from_html(text)
    if html_ids:
        by_name = await _project_member_names(db, workspace_id, project_id)
        allowed = set(by_name.values())
        return {uid for uid in html_ids if uid in allowed}

    by_name = await _project_member_names(db, workspace_id, project_id)
    if not by_name:
        return set()
    mentioned = extract_mention_names(text, catalog=set(by_name.keys()))
    return {by_name[name] for name in mentioned if name in by_name}
