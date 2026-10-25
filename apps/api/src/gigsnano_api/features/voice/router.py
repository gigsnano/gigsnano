from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.provider import LLMProvider, get_llm_provider
from gigsnano_api.bmad.sse import SSE_DONE, SSE_HEADERS, SSE_MEDIA_TYPE, sse_event
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import get_db
from gigsnano_api.features.agents import service as agents_service
from gigsnano_api.features.voice import policy, write
from gigsnano_api.features.voice import service as S
from gigsnano_api.features.voice.governance import (
    COHORT,
    SWITCH,
    EScope,
    PilotCohort,
    Usage,
    resolve,
    voice_available,
)
from gigsnano_api.features.voice.schemas import (
    ConfirmPayload,
    HeartbeatPayload,
    SessionCredential,
    SpeakPayload,
    StartSessionPayload,
    TurnPayload,
)
from gigsnano_api.features.voice.turn import apply_proposal, run_voice_turn
from gigsnano_api.shared.context import WorkspaceContext, get_workspace_context
from gigsnano_api.voice.contracts import EVoiceEvent, VoiceSessionConfig, ordered
from gigsnano_api.voice.provider import build_default_voice_provider

router = APIRouter(tags=["voice"])
_B = "/workspaces/{workspace_slug}/voice/sessions"


def _live(session_id: str, ctx: WorkspaceContext) -> S.VoiceSessionRecord:
    """Resolve the caller's own live session, or say precisely why not.

    410 rather than 404 for a dead session: the client must know the difference
    between "never existed" (a bug, stop) and "over" (start a new one).
    """
    try:
        return S.require_live(session_id, ctx.user.id)
    except S.SessionGone:
        raise HTTPException(status.HTTP_410_GONE, "Voice session is no longer active") from None
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Voice session not found") from None


def _credential(record: S.VoiceSessionRecord, token: str) -> SessionCredential:
    return SessionCredential(
        session_id=record.session_id,
        token=token,
        expires_at=record.expires_at.isoformat(),
        locale=record.locale,
        agent_profile_version=record.agent_profile_version,
        epoch=record.epoch,
    )


@router.post(_B + "/", response_model=SessionCredential)
async def start_voice_session(
    payload: StartSessionPayload,
    request: Request,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    record, token = S.start_session(
        actor_id=ctx.user.id,
        workspace_slug=ctx.workspace.slug,
        locale=payload.locale,
        agent_profile_version=payload.agent_profile_version,
        # Bound at issue time so a token lifted into another site's page is
        # rejected by the transport that later honours it.
        origin=request.headers.get("origin", ""),
    )
    return _credential(record, token)


@router.post(_B + "/{session_id}/heartbeat/")
async def heartbeat_voice_session(
    session_id: str,
    payload: HeartbeatPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    record = S.heartbeat(
        _live(session_id, ctx),
        transcript_final=payload.transcript_final,
        draft=payload.draft,
    )
    return {"expires_at": record.expires_at.isoformat(), "transcript_lines": len(record.transcript)}


@router.post(_B + "/{session_id}/reconnect/")
async def reconnect_voice_session(
    session_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    state, token = S.reconnect(_live(session_id, ctx))
    return {**state, "token": token}


@router.delete(_B + "/{session_id}/")
async def end_voice_session(
    session_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    S.end_session(_live(session_id, ctx))
    return {"ended": True}


# ── Policy + transcription (GIN-491 end-to-end) ──────────────────────────────


#: Opens voice to every workspace. Spelled as an explicit token rather than
#: "empty means everyone", because a config value that silently defaults to
#: maximum exposure is how a pilot becomes a launch by accident.
ALL_WORKSPACES = "*"


def _configured_slugs() -> set[str]:
    return {s.strip() for s in settings.voice_enabled_workspaces.split(",") if s.strip()}


def _cohort() -> PilotCohort:
    """The pilot allowlist, from config rather than a client claim.

    Server-side on purpose: enablement that a browser could assert is not an
    allowlist, it is a suggestion.
    """
    slugs = _configured_slugs()
    if ALL_WORKSPACES in slugs:
        return PilotCohort(exit_criteria_met=True, open_to_everyone=True)
    return PilotCohort(workspace_slugs=frozenset(slugs)) if slugs else COHORT


@router.get(_B.replace("/voice/sessions", "/voice/policy") + "/")
async def get_voice_policy(ctx: WorkspaceContext = Depends(get_workspace_context)):
    """What the UI asks before offering a microphone.

    Returns a reason on every negative, because "the button is greyed out and I
    don't know why" is the support ticket this avoids.
    """
    slugs = _configured_slugs()
    enabled = bool(slugs) and (ALL_WORKSPACES in slugs or ctx.workspace.slug in slugs)
    policy = resolve({EScope.WORKSPACE: {"enabled": enabled}} if slugs else None)
    verdict = voice_available(
        policy,
        workspace_slug=ctx.workspace.slug,
        usage=Usage(),
        switch=SWITCH,
        cohort=_cohort(),
    )
    return {
        "enabled": verdict.available,
        "reason": verdict.reason,
        "fallback_to_text": verdict.fallback_to_text,
        "locales": list(policy["locales"]),
        "require_confirmation": policy["require_confirmation"],
        # Says which adapter is live, so "why is nothing transcribed" is one
        # request to answer rather than a log dig.
        "provider": "azure" if settings.azure_speech_key else "fake",
    }


@router.post(_B + "/{session_id}/audio/")
async def transcribe_audio(
    session_id: str,
    audio: UploadFile,
    ctx: WorkspaceContext = Depends(get_workspace_context),
):
    """Transcribe one utterance for a live session.

    The browser posts a complete WAV rather than streaming: the adapter is batch
    (see provider_azure), and inventing a websocket in front of a batch recogniser
    would add a hop without adding a partial.

    Audio is never stored. It is transcribed and dropped — the transcript is what
    retention policy governs, and raw audio retention is off by default (GIN-520).
    """
    record = _live(session_id, ctx)
    payload = await audio.read()
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No audio received")

    session = await build_default_voice_provider().start_session(
        VoiceSessionConfig(
            actor_id=ctx.user.id,
            workspace_slug=ctx.workspace.slug,
            correlation_id=record.session_id,
            locale=record.locale,
            agent_profile_version=record.agent_profile_version,
        )
    )
    await session.send_audio(payload)

    transcript, error, retryable = "", "", False
    async for event in ordered(session.events()):
        if event.type is EVoiceEvent.TRANSCRIPT_FINAL:
            transcript = event.text
        elif event.type is EVoiceEvent.ERROR:
            error, retryable = event.error_code, event.retryable

    if transcript:
        # Acknowledged, so a reconnect restores it. Anything not acknowledged is
        # in-flight and deliberately not replayed.
        S.heartbeat(record, transcript_final=transcript)
    return {
        "transcript": transcript,
        "error": error,
        "retryable": retryable,
        "session_id": record.session_id,
    }


@router.post(_B + "/{session_id}/speak/")
async def speak(
    session_id: str,
    payload: SpeakPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Synthesize one sentence of the agent's reply.

    One sentence rather than one turn on purpose: playback starts before the reply
    has finished generating, and a sentence boundary is where barge-in can cut
    cleanly. Stopping mid-word is what makes an interrupted assistant sound broken.
    """
    record = _live(session_id, ctx)
    text = payload.text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to speak")

    voice = ""
    if payload.agent_id:
        agent = await agents_service.get_agent(db, ctx.workspace.id, payload.agent_id)
        voice = agent.voice_id if agent is not None else ""

    session = await build_default_voice_provider().start_session(
        VoiceSessionConfig(
            actor_id=ctx.user.id,
            workspace_slug=ctx.workspace.slug,
            correlation_id=record.session_id,
            locale=record.locale,
            voice=voice,
            agent_profile_version=record.agent_profile_version,
        )
    )
    await session.synthesize(text)

    audio = bytearray()
    try:
        async for event in ordered(session.events()):
            if event.type is EVoiceEvent.SYNTHESIS_CHUNK:
                audio.extend(event.audio)
            elif event.type is EVoiceEvent.ERROR:
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY, f"Speech failed: {event.error_code}"
                )
    finally:
        # The 502 above (and any provider fault) must not skip cleanup — a
        # session left open is the one thing a failed synthesis can leak.
        await session.end()

    return Response(content=bytes(audio), media_type="audio/mpeg")


# ── Turn: intent, triage, and the read path (GIN-491 end-to-end, Task 8) ────


@router.post(_B + "/{session_id}/turn/")
async def take_turn(
    session_id: str,
    payload: TurnPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
    llm: LLMProvider = Depends(get_llm_provider),
):
    record = _live(session_id, ctx)
    transcript = payload.transcript.strip()
    if not transcript:
        # An empty transcript is a mis-fire of the client's endpointing, not a
        # request. Spending a turn (and its cost) on it is a bug users pay for.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing was said")

    agent = await agents_service.get_agent(db, ctx.workspace.id, payload.agent_id)
    if agent is None or not agent.enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    async def stream():
        async for event in run_voice_turn(
            db, ctx, record, agent, transcript, payload.project_id or None, llm
        ):
            yield sse_event(event)
        yield SSE_DONE

    return StreamingResponse(stream(), media_type=SSE_MEDIA_TYPE, headers=SSE_HEADERS)


# ── Confirm: apply a proposal the user has read back and approved (Task 14) ─


@router.post(_B + "/{session_id}/confirm/")
async def confirm_write(
    session_id: str,
    payload: ConfirmPayload,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: AsyncSession = Depends(get_db),
):
    """Apply the pending write, bound to the exact proposal that was read aloud.

    The hash is the binding. A proposal that changed has a different hash, so a
    confirmation given for one action can never apply a different one — which is
    why confirmation is by hash and not by a boolean.
    """
    record = _live(session_id, ctx)
    if record.pending is None or record.pending[0].hash != payload.hash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That proposal is no longer current — ask the agent to repeat it",
        )
    proposal, command, agent_id = record.pending

    # `write.Confirmation`'s own TTL check is measured against itself here (it's
    # minted and authorised back-to-back inside `apply_proposal`), so it can
    # never fire. The clock that actually matters is how long this proposal has
    # sat in `record.pending` since it was read aloud -- check that directly,
    # against the TTL `write.py` already defines, before minting a Confirmation.
    age = (datetime.now(timezone.utc) - proposal.created_at).total_seconds()
    if age > write.CONFIRMATION_TTL_SECONDS:
        record.pending = None
        raise HTTPException(status.HTTP_409_CONFLICT, policy.spoken("confirmation_stale"))

    # Cleared before applying: a retry must go through a fresh proposal rather
    # than replay this one, which is what stops a double-tap filing two items.
    record.pending = None

    agent = await agents_service.get_agent(db, ctx.workspace.id, agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The agent behind this proposal is gone")

    receipt = await apply_proposal(db, ctx, record, agent, proposal, command, None)
    return {
        "outcome": receipt.outcome,
        "action": receipt.action,
        "result_code": receipt.result_code or "",
        "result_url": receipt.result_url or "",
        "detail": receipt.detail,
        "correlation_id": receipt.correlation_id,
    }
