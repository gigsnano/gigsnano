"""End-to-end correlation, safe metrics and cost control (GIN-521).

One `correlation_id` follows a turn from the browser through the provider, the
resolver, the policy gate, the tool and back. Without it, "why was that slow?"
is unanswerable, because the only honest answer — *which* of five hops spent the
time — is exactly what a flat log cannot say.

Two constraints shape the metric set:

**Privacy.** Every field here is a count, a duration, an id or an enum. Nothing
carries what the user said. `audit.log_safe` is the enforcement; this module is
the vocabulary.

**Cardinality.** Labels are bounded sets — stage, outcome, workspace. Never a
work-item code, a project name or a transcript hash, each of which turns one
time series into millions and quietly bankrupts the metrics bill the feature was
supposed to be watching.

Provider latency is tracked as its own stage rather than folded into a total, so
a dashboard can answer the only question that matters during an incident: is it
them or is it us?
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class EStage(StrEnum):
    """The hops a turn passes through. Bounded, so it is a safe metric label."""

    TRANSPORT = "transport"  # browser <-> broker
    PROVIDER_STT = "provider_stt"
    RUNTIME = "runtime"  # intent + resolution
    POLICY = "policy"
    TOOL = "tool"  # GigsNano API
    PROVIDER_TTS = "provider_tts"


#: Which stages are somebody else's latency. The split a dashboard needs.
PROVIDER_STAGES = frozenset({EStage.PROVIDER_STT, EStage.PROVIDER_TTS})


class EOutcome(StrEnum):
    OK = "ok"
    CLARIFIED = "clarified"
    DENIED = "denied"
    ABANDONED = "abandoned"
    FAILED = "failed"


@dataclass
class TurnTrace:
    """One turn's timings, keyed by stage. Durations only — never payloads."""

    correlation_id: str
    session_id: str
    workspace: str
    stages: dict[EStage, float] = field(default_factory=dict)
    outcome: EOutcome = EOutcome.OK

    def record(self, stage: EStage, duration_ms: float) -> None:
        self.stages[stage] = self.stages.get(stage, 0.0) + duration_ms

    @property
    def total_ms(self) -> float:
        return sum(self.stages.values())

    @property
    def provider_ms(self) -> float:
        return sum(ms for stage, ms in self.stages.items() if stage in PROVIDER_STAGES)

    @property
    def gigsnano_ms(self) -> float:
        """Our latency, separated from theirs. During an incident this is the
        first number anyone asks for."""
        return self.total_ms - self.provider_ms

    def as_metric(self) -> dict:
        """Bounded-cardinality labels only — no codes, names or hashes."""
        return {
            "correlation_id": self.correlation_id,
            "workspace": self.workspace,
            "outcome": self.outcome.value,
            "total_ms": round(self.total_ms, 2),
            "provider_ms": round(self.provider_ms, 2),
            "gigsnano_ms": round(self.gigsnano_ms, 2),
            **{f"{stage.value}_ms": round(ms, 2) for stage, ms in self.stages.items()},
        }


#: SLO targets from the epic's non-functional requirements.
SLO_FIRST_PARTIAL_MS = 500
SLO_READ_RESPONSE_P95_MS = 2500


@dataclass(frozen=True)
class SloBreach:
    name: str
    observed: float
    target: float


def check_slos(*, first_partial_ms: float | None = None, read_p95_ms: float | None = None) -> list[SloBreach]:
    breaches = []
    if first_partial_ms is not None and first_partial_ms > SLO_FIRST_PARTIAL_MS:
        breaches.append(SloBreach("first_partial_transcript", first_partial_ms, SLO_FIRST_PARTIAL_MS))
    if read_p95_ms is not None and read_p95_ms > SLO_READ_RESPONSE_P95_MS:
        breaches.append(SloBreach("read_response_p95", read_p95_ms, SLO_READ_RESPONSE_P95_MS))
    return breaches


@dataclass
class CostWindow:
    """Spend so far against a cap, with an anomaly signal.

    The anomaly check is a rate, not a total: a cap alone only tells you about
    runaway spend once the money is gone.
    """

    audio_minutes: float = 0.0
    spend: float = 0.0
    cap: float = 250.0

    @property
    def exhausted(self) -> bool:
        return self.spend >= self.cap

    def anomalous(self, *, baseline_per_day: float, days_elapsed: float) -> bool:
        if days_elapsed <= 0 or baseline_per_day <= 0:
            return False
        return (self.spend / days_elapsed) > baseline_per_day * 3
