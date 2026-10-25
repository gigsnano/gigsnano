"""Meeting-link parsing. Host matching is exact (or a *.zoom.us suffix) so a
lookalike host such as meet.google.com.evil.com is rejected."""
import re
from dataclasses import dataclass, replace
from urllib.parse import parse_qs, unquote, urlsplit, urlunsplit

from gigsnano_api.models.meetings import EMeetingPlatform

_MEET_CODE = re.compile(r"^[a-z]{3}-[a-z]{4}-[a-z]{3}$")
_TEAMS_THREAD_ID = re.compile(r"^19:meeting_[A-Za-z0-9_-]+@thread\.v[0-9]+$")


@dataclass(frozen=True)
class ParsedLink:
    platform: EMeetingPlatform
    native_meeting_id: str
    passcode: str | None
    canonical_url: str = ""


def _first(query: dict[str, list[str]], key: str) -> str | None:
    values = query.get(key)
    return values[0] if values and values[0] else None


def _match_google_meet(host: str, segs: list[str], query: dict[str, list[str]]) -> ParsedLink | None:
    if host != "meet.google.com" or not segs or not _MEET_CODE.match(segs[0].lower()):
        return None
    return ParsedLink(EMeetingPlatform.GOOGLE_MEET, segs[0].lower(), None)


def _match_teams_live(host: str, segs: list[str], query: dict[str, list[str]]) -> ParsedLink | None:
    if host != "teams.live.com" or len(segs) < 2 or segs[0] != "meet" or not segs[1].isdigit():
        return None
    return ParsedLink(EMeetingPlatform.TEAMS, segs[1], _first(query, "p"))


def _match_teams_microsoft(host: str, segs: list[str], query: dict[str, list[str]]) -> ParsedLink | None:
    if host != "teams.microsoft.com" or len(segs) < 3 or segs[:2] != ["l", "meetup-join"]:
        return None
    thread_id = unquote(segs[2])
    if not _TEAMS_THREAD_ID.match(thread_id):
        return None
    return ParsedLink(EMeetingPlatform.TEAMS, thread_id, None)


def _match_zoom(host: str, segs: list[str], query: dict[str, list[str]]) -> ParsedLink | None:
    if host != "zoom.us" and not host.endswith(".zoom.us"):
        return None
    if len(segs) < 2 or segs[0] not in ("j", "wc") or not segs[1].isdigit():
        return None
    return ParsedLink(EMeetingPlatform.ZOOM, segs[1], _first(query, "pwd"))


_MATCHERS = (_match_google_meet, _match_teams_live, _match_teams_microsoft, _match_zoom)


def parse_meeting_link(url: str) -> ParsedLink:
    raw = (url or "").strip()
    if raw and "://" not in raw:
        raw = "https://" + raw
    parts = urlsplit(raw)
    if parts.scheme not in ("http", "https"):
        raise ValueError("Unsupported meeting link")
    if parts.username or parts.password:
        # Userinfo (user:pass@host) has no legitimate use in a meeting link and
        # is a classic way to smuggle a different host past a naive check —
        # reject rather than store it.
        raise ValueError("Unsupported meeting link")
    host = (parts.hostname or "").lower()
    segs = [s for s in parts.path.split("/") if s]
    query = parse_qs(parts.query)

    for matcher in _MATCHERS:
        result = matcher(host, segs, query)
        if result is not None:
            canonical = urlunsplit(("https", host, parts.path, parts.query, ""))
            return replace(result, canonical_url=canonical)
    raise ValueError("Unsupported meeting link")
