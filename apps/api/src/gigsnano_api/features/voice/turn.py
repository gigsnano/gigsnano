"""One voice turn: transcript in, spoken-shaped events out.

This module is the wire GIN-491 left unbuilt. `parse_command`, `triage`, the
policy checker and the read runner were all implemented and imported by nothing
outside this package — the decisions were made and never reachable. Here they
finally run.

Order is the point, and it is the same order `policy.enforce` assumes:

    extract -> parse_command -> triage -> resolve -> enforce -> execute

`resolve` matters as its own step: the model can only ever hand back a phrase
("Apollo"), never a real id — it has no database access, and `_EXTRACT_SYSTEM`
tells it to mark a field missing rather than invent one. Turning that phrase
into a real project id (or into "several match, which one?") is `resolver`'s
job, not the model's, so it runs here, after triage, on every read.

`extract` is separate from `parse_command` because the model produces *untrusted*
JSON: extraction is the only step that trusts the model, and everything after it
treats the result as hostile input. Free prose can never reach a tool.

The event contract the client depends on:

    {"type": "text",          "text": str}          zero or more, in order
    {"type": "tool",          "name": str, "summary": str}
    {"type": "clarification", "field": str, "question": str, "candidates": [...]}
    {"type": "proposal",      "hash": str, "action": str, "fields": [...]}   (Task 14)
    {"type": "receipt",       "outcome": str, "code": str, "url": str}
    {"type": "error",         "code": str, "retryable": bool}

Exactly one terminal event (clarification / proposal / receipt / error) ends a turn.
"""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.agent.tools.base import Tool, ToolContext
from gigsnano_api.agent.tools.bundles import VOICE_TOOL_ALIASES, registry_for
from gigsnano_api.bmad.provider import LLMProvider
from gigsnano_api.features.voice import policy, read, resolver, write
from gigsnano_api.features.voice.service import VoiceSessionRecord
from gigsnano_api.llm.usage import UsageTally, record_tally
from gigsnano_api.models import Agent, ELlmUsageSource
from gigsnano_api.shared.context import WorkspaceContext
from gigsnano_api.voice.commands import (
    Blocked,
    Clarification,
    EFieldState,
    ERiskClass,
    EVoiceIntent,
    SchemaRejected,
    VoiceCommand,
    parse_command,
    triage,
)

#: The runner-vocabulary name for the capability this task's read path exercises
#: (list/search/get/get-context/list-mine/list-projects all alias to this one
#: tool — see `agent/tools/bundles.py::VOICE_TOOL_ALIASES`). An agent whose
#: composed bundles don't include it must not get real work-item data narrated
#: back just because it holds *some* voice-reachable tool, e.g. `spend_time`.
_WORK_ITEM_READ_TOOL = "query_work_items"

#: The shape the model must emit. Mirrors VoiceCommand — a model that cannot fill
#: this produces a SchemaRejected, which is a spoken "say that again", not a guess.
VOICE_COMMAND_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "enum": ["read", "draft", "create", "update", "comment",
                     "clarification", "correction", "cancel", "unsupported"],
        },
        "tool": {"type": ["string", "null"]},
        "fields": {
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "state": {
                        "type": "string",
                        "enum": ["resolved", "missing", "ambiguous", "invalid", "inaccessible"],
                    },
                    "value": {},
                    "evidence": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": ["state"],
            },
        },
        "utterance": {"type": "string"},
    },
    "required": ["intent"],
}

_EXTRACT_SYSTEM = (
    "You convert one spoken sentence into a single structured command. Never "
    "invent a project, person or work item that was not said — mark the field "
    "`missing` instead. If the request is a deletion, a bulk change or a "
    "permission change, the intent is `unsupported`."
)


async def extract_command(
    provider: LLMProvider, transcript: str, correlation_id: str, *, tally: UsageTally | None = None
) -> VoiceCommand:
    """Turn one utterance into a validated command. Raises SchemaRejected.

    The only step that trusts the model. `parse_command` rejects unknown fields
    and off-list tools rather than repairing them: a silently dropped field is
    how "assign to Divya" becomes "assign to nobody".
    """
    result = await provider.extract(
        system=[{"type": "text", "text": _EXTRACT_SYSTEM}],
        messages=[{"role": "user", "content": transcript}],
        tool_name="voice_command",
        schema=VOICE_COMMAND_SCHEMA,
    )
    if tally is not None:
        tally.add(result)
    raw = dict(result.data or {})
    raw.setdefault("utterance", transcript)
    raw["correlation_id"] = correlation_id
    return parse_command(raw)


def _reachable_tool(agent: Agent, tool: str | None) -> Tool | None:
    """The Tool this agent may actually dispatch for a spoken tool name.

    Two things happen in one place, and both are load-bearing:

    - **Vocabulary.** The model names MCP tools (`ALLOWED_TOOLS`); the registry
      is keyed by runner names. `VOICE_TOOL_ALIASES` is the only thing that
      knows both, so nothing else has to.
    - **Governance.** Every dispatch on a call — read, propose and confirm —
      resolves through `registry_for(bundles, voice=True)`, i.e. through
      `union(agent.bundles) ∩ ALLOWED_TOOLS` and nothing else. Composing an
      agent therefore genuinely decides what a microphone reaches, and can
      never widen it past the reviewed allow-list.

    Returning the Tool rather than a bool is what lets the read path *call* it:
    gating on one hardcoded name and then running a fixed code path is how
    `project_health_summary` / `ai_spend_summary` ended up unreachable on every
    call despite being in an agent's bundles.
    """
    if not tool:
        return None
    return registry_for(list(agent.bundles or []), voice=True).get(
        VOICE_TOOL_ALIASES.get(tool, tool)
    )


async def _resolve_project(
    db: AsyncSession, ctx: WorkspaceContext, command: VoiceCommand
) -> tuple[str | None, dict | None]:
    """Turn a spoken project phrase into a real id, or a clarification event.

    `field.value` is never trusted as an id, whatever `state` the model claimed
    for it — the model has no database access, so anything it wrote there is a
    phrase ("Apollo"), not a resolution. Returns `(None, event)` when the phrase
    named more than one project: guessing between them would silently answer
    about the wrong one. A phrase that matches nothing, or matches only a
    project this actor cannot see (the resolver filters those out before
    ranking, so they surface identically), returns `(None, None)` — the caller
    falls back to the session's own project, same as when nothing was said.
    """
    field = command.fields.get("project")
    phrase = field.value if field is not None and isinstance(field.value, str) else ""
    if not phrase:
        return None, None
    resolved = await resolver.resolve_project(db, ctx, phrase)
    if resolved.state is EFieldState.AMBIGUOUS:
        question = "Which project did you mean?"
        return None, {
            "type": "clarification",
            "field": "project",
            "question": question,
            "candidates": [
                {"id": c.id, "label": c.label, "evidence": c.evidence}
                for c in resolved.candidates
            ],
        }
    return (resolved.value if resolved.usable else None), None


async def _run_read(
    db: AsyncSession,
    ctx: WorkspaceContext,
    record: VoiceSessionRecord,
    agent: Agent,
    outcome: VoiceCommand,
    project_id: str | None,
) -> AsyncIterator[dict]:
    """Answer a read-only turn: policy, tool choice, project scope, dispatch."""
    # `enforce` is only meaningful here: for a material write it would always
    # come back `not_confirmed` at propose time (the propose call *is* the
    # unconfirmed leg), which is nothing new to act on — `apply_proposal` is
    # what runs `enforce(..., confirmed=True)` for the write path.
    decision = policy.record(
        policy.enforce(outcome, confirmed=False), outcome, correlation_id=record.session_id
    )
    if not decision.allowed:
        yield {"type": "text", "text": decision.spoken}
        yield {"type": "error", "code": decision.reason_code, "retryable": False}
        return

    # A read names a tool, and which tool decides everything: an agent composed
    # from `spend_time` answers "what have we spent?" and an agent composed from
    # `project_health` answers "how is it tracking?". Un-named falls back to the
    # work-item read, which is what a bare "what's open?" means. `triage` cannot
    # route a mutating tool here (`VoiceCommand.risk` promotes those to
    # MATERIAL_WRITE), so dispatch below is read-only by construction.
    tool = _reachable_tool(agent, outcome.tool or _WORK_ITEM_READ_TOOL)
    if tool is None:
        yield {"type": "text", "text": policy.spoken("risk_blocked")}
        yield {"type": "error", "code": "not_permitted", "retryable": False}
        return

    resolved_project_id, clarification = await _resolve_project(db, ctx, outcome)
    if clarification is not None:
        yield {"type": "text", "text": clarification["question"]}
        yield clarification
        return

    scoped_project_id = resolved_project_id or project_id
    if tool.name == _WORK_ITEM_READ_TOOL:
        # `read.run` stays the work-item read path: it is the only one that
        # carries the total/returned/truncated honesty `narrate` depends on.
        result = await read.run(db, ctx, read.Query(project_id=scoped_project_id))
        yield {"type": "text", "text": read.narrate(result)}
        yield {"type": "receipt", "outcome": "applied", "code": "", "url": ""}
        return

    outcome_result = await tool.handler(
        ToolContext(db=db, workspace=ctx.workspace, user=ctx.user, role=ctx.role,
                    project_id=scoped_project_id),
        {},
    )
    yield {"type": "tool", "name": tool.name, "summary": outcome_result.summary or tool.name}
    yield {"type": "text", "text": outcome_result.content}
    yield {
        "type": "receipt",
        "outcome": "failed" if outcome_result.is_error else "applied",
        "code": "",
        "url": "",
    }


async def _propose_write(
    record: VoiceSessionRecord, agent: Agent, outcome: VoiceCommand
) -> AsyncIterator[dict]:
    """Offer a write for confirmation. Nothing here touches the database — the
    proposal is parked on the session and only `/confirm/` can spend it."""
    if _reachable_tool(agent, outcome.tool) is None:
        yield {"type": "text", "text": policy.spoken("risk_blocked")}
        yield {"type": "error", "code": "not_permitted", "retryable": False}
        return

    try:
        proposal = build_proposal(outcome)
    except write.ProposalRejected as exc:
        yield {"type": "text", "text": f"I can't do that yet — {exc}"}
        yield {"type": "error", "code": "proposal_rejected", "retryable": False}
        return

    record.pending = (proposal, outcome, agent.id)
    yield {"type": "text", "text": _speak_proposal(proposal)}
    yield {
        "type": "proposal",
        "hash": proposal.hash,
        "action": proposal.action,
        "target_code": proposal.target_id or "",
        "fields": [
            {"name": name, "label": name.replace("_", " "), "value": str(sourced.value),
             "source": sourced.source.value}
            for name, sourced in sorted(proposal.fields.items())
        ],
    }


async def run_voice_turn(
    db: AsyncSession,
    ctx: WorkspaceContext,
    record: VoiceSessionRecord,
    agent: Agent,
    transcript: str,
    project_id: str | None,
    provider: LLMProvider,
) -> AsyncIterator[dict]:
    """Run one turn and yield client events.

    Extract → triage → hand off to the read or write path. Never raises into the
    SSE stream: a provider failure mid-turn becomes an `error` event, because an
    unwound stack loses the transcript being held.
    """
    tally = UsageTally()
    failure: Exception | None = None
    try:
        command = await extract_command(provider, transcript, record.session_id, tally=tally)
    except Exception as exc:  # noqa: BLE001 - a turn fails as an event, not a 500
        failure = exc
    # Tokens were spent whether or not the output parsed, so record before branching.
    await record_tally(db, tally, provider, workspace_id=ctx.workspace.id, user_id=ctx.user.id,
                       source=ELlmUsageSource.VOICE, project_id=project_id)
    if isinstance(failure, SchemaRejected):
        yield {"type": "text", "text": "Sorry — I didn't catch that. Say it again?"}
        yield {"type": "error", "code": "schema_rejected", "retryable": True}
        return
    if failure is not None:
        yield {"type": "text", "text": "Something went wrong on my end."}
        yield {"type": "error", "code": type(failure).__name__, "retryable": True}
        return

    outcome = triage(command)

    if isinstance(outcome, Blocked):
        yield {"type": "text", "text": outcome.reason}
        yield {"type": "error", "code": "blocked", "retryable": False}
        return

    if isinstance(outcome, Clarification):
        yield {"type": "text", "text": outcome.question}
        yield {
            "type": "clarification",
            "field": outcome.field,
            "question": outcome.question,
            "candidates": [
                {"id": c.id, "label": c.label, "evidence": c.evidence} for c in outcome.candidates
            ],
        }
        return

    if outcome.risk is ERiskClass.READ_ONLY:
        async for event in _run_read(db, ctx, record, agent, outcome, project_id):
            yield event
        return

    async for event in _propose_write(record, agent, outcome):
        yield event


def build_proposal(command: VoiceCommand) -> write.Proposal:
    """Turn resolved command fields into a previewable write.

    Everything the user actually said is SPOKEN; anything the agent filled in is
    GENERATED, which is what `Proposal.inferred_fields` reads back before asking
    for confirmation. Mislabelling an inferred value as spoken is how a user
    approves a title they never chose.

    CREATE only — V1 boundary. `build_update` needs the target's current state
    and `updated_at` for `check_not_stale`, which is its own slice of work; a
    COMMENT proposal is out of scope the same way. Both raise rather than
    previewing a write this module cannot yet safely build.

    A field the user actually spoke but `write.CREATE_FIELDS` does not accept
    (e.g. an assignee on a create) must never be quietly left out of the
    proposal — that is exactly how "assign to Divya" becomes "assign to
    nobody" (`voice/commands.py`'s own docstring). So an unsupported-but-spoken
    field refuses the whole proposal by name rather than building one that
    omits it; the caller (`run_voice_turn`) turns `ProposalRejected` into a
    spoken reason, never a silent drop.
    """
    usable = {name: f for name, f in command.fields.items() if f.usable}
    if command.intent is EVoiceIntent.CREATE:
        unsupported = sorted(name for name in usable if name not in write.CREATE_FIELDS)
        if unsupported:
            raise write.ProposalRejected(
                f"I can't set {' or '.join(unsupported)} by voice yet — say the rest "
                "without it and I'll create it, or add that after"
            )
        fields = {
            name: write.Sourced(value=f.value, source=write.ESource.SPOKEN)
            for name, f in usable.items()
        }
        return write.build_create(fields)
    raise write.ProposalRejected(f"{command.intent.value} is not writable by voice yet")


def _speak_proposal(proposal: write.Proposal) -> str:
    """Read the write back before doing it. Inferred values are called out — a
    value the agent invented must never slip through inside a yes."""
    values = ", ".join(f"{n} {s.value}" for n, s in sorted(proposal.fields.items()))
    inferred = proposal.inferred_fields
    tail = f" I filled in {', '.join(inferred)} myself." if inferred else ""
    return f"I'll {proposal.action} {values}.{tail} Shall I?"


async def apply_proposal(
    db: AsyncSession,
    ctx: WorkspaceContext,
    record: VoiceSessionRecord,
    agent: Agent,
    proposal: write.Proposal,
    command: VoiceCommand,
    project_id: str | None,
) -> write.Receipt:
    """Apply a confirmed proposal. Dispatches through the same intersected
    registry the turn used, so confirmation can never reach a tool the turn
    itself could not.

    Idempotency-keyed on the proposal's content hash, not a per-call nonce:
    `Proposal.hash` covers only action/target/payload, so a user restating the
    same intent in a brand-new turn gets the identical hash and the identical
    key as a dropped-connection retry of this exact one. Both must resolve to
    one write, never two — `write.LEDGER` is what makes the second one a replay
    instead of a second `create_work_item` call.
    """
    key = proposal.idempotency_key(session_id=record.session_id)
    replayed = write.LEDGER.replay(key)
    if replayed is not None:
        return replayed

    confirmation = write.confirm(proposal, actor_id=ctx.user.id, session_id=record.session_id)
    write.authorise(proposal, confirmation, actor_id=ctx.user.id, session_id=record.session_id)

    decision = policy.record(
        policy.enforce(command, confirmed=True), command, correlation_id=record.session_id
    )
    if not decision.allowed:
        # `decision.spoken`, not `.reason_code`: the code is machine-only
        # telemetry (logged by `policy.record` above); the receipt detail is
        # user-facing and must stay as uninformative about the object as the
        # spoken refusal is.
        return write.LEDGER.record(key, write.Receipt(
            action=proposal.action, proposal_hash=proposal.hash,
            idempotency_key=key, correlation_id=record.session_id,
            outcome="failed", detail=decision.spoken,
        ))

    tool = _reachable_tool(agent, command.tool)
    if tool is None:
        # Unreachable via the UI; reached only if a bundle changed between the
        # proposal and the yes. Refusing beats writing with an unvetted tool.
        return write.LEDGER.record(key, write.Receipt(
            action=proposal.action, proposal_hash=proposal.hash,
            idempotency_key=key, correlation_id=record.session_id,
            outcome="failed", detail="tool_unavailable",
        ))

    result = await tool.handler(
        ToolContext(db=db, workspace=ctx.workspace, user=ctx.user, role=ctx.role,
                    project_id=project_id),
        proposal.payload,
    )
    return write.LEDGER.record(key, write.Receipt(
        action=proposal.action, proposal_hash=proposal.hash,
        idempotency_key=key, correlation_id=record.session_id,
        outcome="failed" if result.is_error else "applied",
        detail=result.summary or "", result_url=result.link or "",
        # `ToolResult` has no structured work-item-code field (only
        # content/summary/link) -- the code only ever appears embedded in
        # prose ("Created APO-12: ..."). Parsing that out would be guessing at
        # a shape that isn't guaranteed across tools, which is exactly the
        # "stuffing something unrelated in" this fix exists to stop. Left
        # empty until a tool actually surfaces one structurally.
        result_code="",
    ))
