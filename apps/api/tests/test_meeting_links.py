import pytest

from gigsnano_api.features.meetings.links import ParsedLink, parse_meeting_link
from gigsnano_api.models.meetings import EMeetingPlatform as P


@pytest.mark.parametrize("url,expected", [
    ("https://meet.google.com/abc-defg-hij",
     ParsedLink(P.GOOGLE_MEET, "abc-defg-hij", None, "https://meet.google.com/abc-defg-hij")),
    ("meet.google.com/ABC-DEFG-HIJ?authuser=0",
     ParsedLink(P.GOOGLE_MEET, "abc-defg-hij", None, "https://meet.google.com/ABC-DEFG-HIJ?authuser=0")),
    ("https://teams.live.com/meet/9387167464734?p=qxJanYOcdjN4d6UlGa",
     ParsedLink(P.TEAMS, "9387167464734", "qxJanYOcdjN4d6UlGa",
                "https://teams.live.com/meet/9387167464734?p=qxJanYOcdjN4d6UlGa")),
    ("https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC%40thread.v2/0?context=%7b%7d",
     ParsedLink(P.TEAMS, "19:meeting_ABC@thread.v2", None,
                "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC%40thread.v2/0?context=%7b%7d")),
    ("https://us02web.zoom.us/j/81234567890?pwd=secret",
     ParsedLink(P.ZOOM, "81234567890", "secret", "https://us02web.zoom.us/j/81234567890?pwd=secret")),
    ("https://zoom.us/wc/81234567890/join",
     ParsedLink(P.ZOOM, "81234567890", None, "https://zoom.us/wc/81234567890/join")),
])
def test_parses_supported_links(url, expected):
    assert parse_meeting_link(url) == expected


def test_stores_canonical_url_not_raw_input():
    parsed = parse_meeting_link("meet.google.com/abc-defg-hij")
    assert parsed.canonical_url == "https://meet.google.com/abc-defg-hij"


@pytest.mark.parametrize("url", [
    "", "https://example.com/abc-defg-hij", "https://meet.google.com.evil.com/abc-defg-hij",
    "https://meet.google.com/not-a-code", "ftp://meet.google.com/abc-defg-hij",
    "https://zoom.us/j/notdigits", "https://teams.live.com/meet/abc",
    # Path traversal into Vexa's own path space via an unquoted Teams thread id —
    # the thread id must match Teams' own `19:meeting_...@thread.vN` shape.
    "https://teams.microsoft.com/l/meetup-join/..%2F..%2Fadmin%2Fusers%3Fx=1%23/0",
    # Userinfo (user:pass@host) — a classic way to smuggle a different host past
    # a naive check; javascript:alert(1);`@meet.google.com/abc-defg-hij/ parses
    # as a URL with userinfo "javascript:alert(1);`" once "https://" is prepended.
    "javascript:alert(1);`@meet.google.com/abc-defg-hij/",
    "user:pw@meet.google.com/abc-defg-hij",
])
def test_rejects_unsupported_links(url):
    with pytest.raises(ValueError, match="Unsupported meeting link"):
        parse_meeting_link(url)
