"""Guarded state machine for an agent run (GIN-249). Pure — no DB. Illegal
transitions raise so a run can never skip or reverse into an impossible state."""

from gigsnano_api.models.agent_runs import EAgentRunState as S

# Legal transitions. queued→planning→executing→awaiting_review→done, with:
# reject at review → back to executing (rework), error → failed from any active
# state, and retry from a terminal-but-not-done state → queued.
ALLOWED: dict[S, set[S]] = {
    S.QUEUED: {S.PLANNING, S.STOPPED, S.FAILED},
    S.PLANNING: {S.EXECUTING, S.AWAITING_REVIEW, S.STOPPED, S.FAILED},
    S.EXECUTING: {S.AWAITING_REVIEW, S.DONE, S.STOPPED, S.FAILED},
    S.AWAITING_REVIEW: {S.DONE, S.EXECUTING, S.STOPPED, S.FAILED},
    S.DONE: set(),  # terminal
    S.FAILED: {S.QUEUED},  # retry
    S.STOPPED: {S.QUEUED},  # retry
}


def can_transition(frm: S, to: S) -> bool:
    return to in ALLOWED.get(frm, set())


def assert_transition(frm: S, to: S) -> None:
    if not can_transition(frm, to):
        raise ValueError(f"illegal agent-run transition: {frm.value} -> {to.value}")
