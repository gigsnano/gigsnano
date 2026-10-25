"""Meeting-bot provider seam (spec 2026-09-19). Routes and the sync loop talk to
MeetingBotProvider only; Vexa's wire shapes stay inside VexaMeetingBotProvider.
The Vexa status/segment mapping below is from Vexa v0.12 source and must be
re-checked in the live-meeting spike."""
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
from urllib.parse import quote

import httpx
from fastapi import Request

from gigsnano_api.core.config import settings
from gigsnano_api.models.meetings import EMeetingPlatform, EMeetingStatus


class MeetingBotError(Exception):
    """The bot service failed or is unreachable."""


@dataclass(frozen=True)
class BotHandle:
    external_id: str | None


@dataclass(frozen=True)
class BotSegment:
    seq: int
    speaker: str | None
    text: str
    start_ms: int
    end_ms: int


@dataclass(frozen=True)
class BotState:
    # None means "no status change" — the provider reported a status we don't
    # recognise, and apply_bot_state keeps whatever status the meeting already
    # has rather than guessing (see the Vexa cutover note on get_state below).
    status: EMeetingStatus | None
    segments: list[BotSegment] = field(default_factory=list)
    failure_reason: str | None = None


class MeetingBotProvider(Protocol):
    async def start_bot(self, *, platform: EMeetingPlatform, native_meeting_id: str,
                        passcode: str | None, bot_name: str) -> BotHandle: ...
    async def get_state(self, *, platform: EMeetingPlatform, native_meeting_id: str) -> BotState: ...
    async def stop_bot(self, *, platform: EMeetingPlatform, native_meeting_id: str) -> None: ...


FAKE_SCRIPT: list[tuple[str, str]] = [
    ("Ada", "Thanks for joining. Let's review the checkout redesign."),
    ("Alan", "The payment timeout is still failing for some cards. I'll fix that bug by Friday."),
    ("Ada", "We also need saved cards as a feature before launch."),
    ("Alan", "Agreed. I'll write the spec for saved cards next week."),
    ("Ada", "Great. Let's wrap up there."),
]


class FakeMeetingBotProvider:
    """Deterministic: poll 0 joining, poll 1 waiting, then one new segment per
    poll while in call, then ended once the script is exhausted."""

    def __init__(self, script: list[tuple[str, str]] | None = None) -> None:
        self._script = list(FAKE_SCRIPT if script is None else script)
        self._polls: dict[str, int] = {}
        self._stopped_at: dict[str, int] = {}

    def _segments(self, count: int) -> list[BotSegment]:
        return [BotSegment(i, speaker, text, i * 4000, i * 4000 + 3500)
                for i, (speaker, text) in enumerate(self._script[:count])]

    async def start_bot(self, *, platform, native_meeting_id, passcode, bot_name) -> BotHandle:
        self._polls[native_meeting_id] = 0
        return BotHandle(external_id=f"fake-{native_meeting_id}")

    async def get_state(self, *, platform, native_meeting_id) -> BotState:
        if native_meeting_id in self._stopped_at:
            return BotState(EMeetingStatus.ENDED, self._segments(self._stopped_at[native_meeting_id]))
        n = self._polls.get(native_meeting_id, 0)
        self._polls[native_meeting_id] = n + 1
        if n == 0:
            return BotState(EMeetingStatus.JOINING)
        if n == 1:
            return BotState(EMeetingStatus.WAITING_ADMISSION)
        spoken = n - 1
        if spoken > len(self._script):
            return BotState(EMeetingStatus.ENDED, self._segments(len(self._script)))
        return BotState(EMeetingStatus.IN_CALL, self._segments(spoken))

    async def stop_bot(self, *, platform, native_meeting_id) -> None:
        polls = self._polls.get(native_meeting_id, 0)
        self._stopped_at[native_meeting_id] = max(0, min(polls - 2, len(self._script)))


_VEXA_STATUS = {
    "requested": EMeetingStatus.REQUESTED,
    "joining": EMeetingStatus.JOINING,
    "awaiting_admission": EMeetingStatus.WAITING_ADMISSION,
    "active": EMeetingStatus.IN_CALL,
    "stopping": EMeetingStatus.IN_CALL,
    "completed": EMeetingStatus.ENDED,
    "failed": EMeetingStatus.FAILED,
}
_FAILURE_REASONS = {
    "zoom_requires_rtms": "Zoom blocked the notetaker from joining.",
    "auth_session_missing": "This meeting only allows signed-in participants.",
    "passcode_required": "This meeting needs a passcode — paste the full invite link.",
    "admission_timeout": "Bot was not admitted",
}


# Vexa's default is to stay ~10 min after everyone leaves; an MVP bot should end
# with the meeting. Milliseconds (meeting_api bot_spawn/router.py _resolve_automatic_leave).
_AUTOMATIC_LEAVE_MS = {"max_time_left_alone": 60_000, "no_one_joined_timeout": 300_000}

# Whole-segment phrases Whisper emits for silent/noisy audio (learned from subtitle credits).
# OpenAI's whisper-1 API ignores Vexa's VAD settings, so silence reaches the model. A segment is
# dropped only when its ENTIRE text is one of these — real speech containing the words is kept.
_HALLUCINATIONS = re.compile(
    r"^(?:"
    r"transcribed by https?://otter\.ai|transcribed by otter\.ai|"
    r"thank you(?: very much)? for watching|thanks for watching|"
    r"subtitles by the amara\.org community|subtitles by the amara org community|"
    r"please subscribe(?: to (?:my|our|the) channel)?|like and subscribe|"
    r"thank you\.?|you"
    r")[\s.!]*$",
    re.IGNORECASE,
)


def _is_hallucination(text: str) -> bool:
    return bool(_HALLUCINATIONS.match(text.strip()))


_EPOCH_THRESHOLD = 1e9  # seconds; anything above is an absolute Unix time (2001+)


def _offset_base(data: dict, starts: list[float]) -> float:
    """Vexa v0.12 reports segment start/end as absolute Unix seconds; we store
    offsets from the meeting start. Use the meeting's start_time when it precedes
    the first segment, else the first segment. Relative values pass through."""
    if not starts or min(starts) < _EPOCH_THRESHOLD:
        return 0.0
    raw = data.get("start_time")
    if raw:
        try:
            started = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if started.timestamp() <= min(starts):
                return started.timestamp()
        except ValueError:
            pass
    return min(starts)


class VexaMeetingBotProvider:
    def __init__(self, base_url: str, api_key: str, *, timeout: float = 10.0,
                 transport: httpx.AsyncBaseTransport | None = None, language: str | None = None) -> None:
        self._language = language or None
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._transport = transport

    async def _request(self, method: str, path: str, *, json: Any = None, ok_404: bool = False) -> Any:
        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout,
                                         transport=self._transport,
                                         headers={"X-API-Key": self._api_key}) as client:
                res = await client.request(method, path, json=json)
        except httpx.RequestError as err:
            raise MeetingBotError(f"Vexa {method} {path} unreachable") from err
        if ok_404 and res.status_code == 404:
            return None
        if res.status_code >= 400:
            raise MeetingBotError(f"Vexa {method} {path} -> {res.status_code}")
        return res.json() if res.content else None

    async def start_bot(self, *, platform, native_meeting_id, passcode, bot_name) -> BotHandle:
        body = {"platform": platform.value, "native_meeting_id": native_meeting_id, "bot_name": bot_name,
                "automatic_leave": dict(_AUTOMATIC_LEAVE_MS)}
        if passcode:
            body["passcode"] = passcode
        if self._language:
            body["language"] = self._language
        data = await self._request("POST", "/bots", json=body)
        bot_id = (data or {}).get("id")
        return BotHandle(external_id=str(bot_id) if bot_id is not None else None)

    async def get_state(self, *, platform, native_meeting_id) -> BotState:
        path = f"/transcripts/{quote(platform.value, safe='')}/{quote(native_meeting_id, safe='')}"
        data = await self._request("GET", path) or {}
        status = _VEXA_STATUS.get(str(data.get("status", "")).lower())
        raw_reason = data.get("failure_reason") or (data.get("data") or {}).get("failure_reason")
        reason = None
        if status is EMeetingStatus.FAILED:
            reason = _FAILURE_REASONS.get(str(raw_reason), "The notetaker could not stay in the meeting.")
        rows = sorted((r for r in data.get("segments") or [] if not _is_hallucination(str(r.get("text") or ""))),
                      key=lambda s: float(s.get("start") or 0))
        base = _offset_base(data, [float(r.get("start") or 0) for r in rows])

        def ms(value) -> int:
            return max(0, round((float(value or 0) - base) * 1000))

        segments = [
            BotSegment(i, (row.get("speaker") or None), str(row.get("text") or "").strip(),
                       ms(row.get("start")), ms(row.get("end")))
            for i, row in enumerate(rows)
        ]
        return BotState(status, segments, reason)

    async def stop_bot(self, *, platform, native_meeting_id) -> None:
        path = f"/bots/{quote(platform.value, safe='')}/{quote(native_meeting_id, safe='')}"
        await self._request("DELETE", path, ok_404=True)


def build_default_meeting_provider() -> MeetingBotProvider | None:
    if settings.vexa_base_url:
        return VexaMeetingBotProvider(settings.vexa_base_url, settings.vexa_api_key,
                                      language=settings.meetings_default_language)
    if settings.meetings_fake_provider:
        return FakeMeetingBotProvider()
    return None


def get_meeting_provider(request: Request) -> MeetingBotProvider | None:
    return getattr(request.app.state, "meeting_provider", None)
