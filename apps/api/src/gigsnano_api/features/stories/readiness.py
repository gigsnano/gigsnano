"""Work-item readiness assessment (GIN-384).

Answers "is this item safe to start / to be in the state it claims?" from the row
itself plus a little context, as rules with a severity and a reason — never by
rewriting the item. An AI project manager can diagnose a backlog with this and
then propose changes; the deciding stays with a human.

Deliberately pure: the rules take a snapshot dataclass, not a session, so they are
testable without a database and reusable by the audit endpoint, the recovery plan
(GIN-385) and the control run (GIN-388) without three copies of "what good looks
like".
"""

from __future__ import annotations

import enum
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

# An item nobody has touched in this long, still not started, is a candidate for
# closing rather than carrying — carrying it is what makes a backlog lie.
STALE_AFTER = timedelta(days=90)
# Below this, a description is a title with extra words, not a specification.
MIN_DESCRIPTION_CHARS = 80
# Token overlap above which two titles are worth a human's duplicate check.
DUPLICATE_SIMILARITY = 0.8

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_AC_RE = re.compile(r"acceptance criteria|given .*when .*then", re.I)
_CHECKLIST_RE = re.compile(r"<li[^>]*data-type=\"taskItem\"|^\s*[-*]\s*\[[ xX]\]", re.M)
_WORD_RE = re.compile(r"[a-z0-9]+")
# "Fix the thing", "TBD", "update stuff" — a title that names no outcome.
_VAGUE_TITLES = frozenset(
    {"tbd", "todo", "fix", "fixes", "bug", "update", "updates", "changes", "misc",
     "cleanup", "refactor", "test", "tests", "wip", "placeholder", "stuff", "task"}
)


class EReadiness(str, enum.Enum):
    DRAFT = "draft"
    NEEDS_CLARIFICATION = "needs_clarification"
    READY = "ready"
    BLOCKED = "blocked"
    IN_PROGRESS_VALID = "in_progress_valid"
    IN_REVIEW_VALID = "in_review_valid"
    COMPLETION_UNVERIFIED = "completion_unverified"
    DUPLICATE_CANDIDATE = "duplicate_candidate"
    OBSOLETE_CANDIDATE = "obsolete_candidate"


class ESeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass(frozen=True)
class Finding:
    rule: str
    severity: ESeverity
    message: str
    #: How sure the rule is. Structural checks (a field is empty) are certain;
    #: judgement calls (this title looks vague) are not, and say so.
    confidence: float
    recommended_action: str


@dataclass(frozen=True)
class Snapshot:
    """Everything the rules read. Assembled by the caller from the DB so the rules
    themselves stay pure and cheap to test."""

    code: str
    title: str
    description: str
    status: str
    type: str
    priority: str | None
    assignee_id: str | None
    parent_id: str | None
    module_id: str | None
    cycle_id: str | None
    start_date: date | None
    target_date: date | None
    estimated: bool
    updated_at: datetime
    #: Codes of items that block this one and are not done yet.
    blocked_by: tuple[str, ...] = ()
    #: Codes whose titles are near-identical to this one.
    duplicate_of: tuple[str, ...] = ()
    #: Committed work (in a cycle, or started) is held to the stricter rules.
    committed: bool = False


@dataclass
class Assessment:
    code: str
    readiness: EReadiness
    score: int  # 0-100, the share of applicable rules that passed
    findings: list[Finding] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "readiness": self.readiness.value,
            "score": self.score,
            "findings": [
                {
                    "rule": f.rule,
                    "severity": f.severity.value,
                    "message": f.message,
                    "confidence": f.confidence,
                    "recommended_action": f.recommended_action,
                }
                for f in self.findings
            ],
        }


def _aware(value: datetime) -> datetime:
    """Postgres hands back tz-aware timestamps, SQLite (tests) naive ones. Read a
    naive value as UTC rather than letting the comparison explode."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def plain_text(html: str | None) -> str:
    return _WS_RE.sub(" ", _TAG_RE.sub(" ", html or "")).strip()


def title_tokens(title: str) -> frozenset[str]:
    return frozenset(_WORD_RE.findall(title.lower()))


def similarity(a: str, b: str) -> float:
    """Jaccard overlap of title words — enough to surface "Add login" vs "Add login
    page" for a human to judge, without pretending to be semantic matching."""
    ta, tb = title_tokens(a), title_tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def find_duplicate_titles(
    items: list[tuple[str, str]], threshold: float = DUPLICATE_SIMILARITY
) -> list[tuple[str, str, float]]:
    """Pairs of (code, code, similarity) worth a duplicate check. O(n²) over titles
    only — fine for a project-sized backlog, and honest about being a heuristic."""
    out: list[tuple[str, str, float]] = []
    for i, (code_a, title_a) in enumerate(items):
        for code_b, title_b in items[i + 1 :]:
            score = similarity(title_a, title_b)
            if score >= threshold:
                out.append((code_a, code_b, round(score, 2)))
    return out


def _describes_outcome(title: str) -> bool:
    words = _WORD_RE.findall(title.lower())
    if len(words) < 3:
        return False
    return not set(words).issubset(_VAGUE_TITLES)


class _Rules:
    """Collects findings and counts how many rules actually applied, so the score
    is "of the rules that made sense for this item", not of a fixed denominator."""

    def __init__(self) -> None:
        self.findings: list[Finding] = []
        self.applicable = 0

    def check(self, passed: bool, rule: str, severity: ESeverity, message: str,
              action: str, confidence: float = 1.0) -> bool:
        self.applicable += 1
        if not passed:
            self.findings.append(Finding(rule, severity, message, confidence, action))
        return passed

    def flag(self, rule: str, severity: ESeverity, message: str,
             action: str, confidence: float) -> None:
        """A signal, not a failed expectation — it does not count against the score's
        denominator, it just has to be seen."""
        self.findings.append(Finding(rule, severity, message, confidence, action))

    @property
    def score(self) -> int:
        if self.applicable == 0:
            return 100
        return max(round(100 * (self.applicable - len(self.findings)) / self.applicable), 0)


def _describes_the_work(rules: _Rules, snap: Snapshot) -> tuple[bool, bool]:
    """Can someone pick this up and know what to build, and when they are done?"""
    body = plain_text(snap.description)
    has_outcome = rules.check(
        _describes_outcome(snap.title), "outcome", ESeverity.WARNING,
        "The title does not name an outcome — it reads as a placeholder.",
        "Rewrite the title as the change the reader will be able to observe.",
        confidence=0.6,
    )
    has_description = rules.check(
        len(body) >= MIN_DESCRIPTION_CHARS, "description", ESeverity.WARNING,
        f"The description is {len(body)} characters — too thin to work from.",
        "Add the context, the scope and what is explicitly out of scope.",
    )
    has_criteria = rules.check(
        bool(_AC_RE.search(body) or _CHECKLIST_RE.search(snap.description or "")),
        "acceptance_criteria", ESeverity.WARNING,
        "No acceptance criteria: nothing states when this is finished.",
        "Add a checklist or a Given/When/Then section that a reviewer can verify.",
        confidence=0.8,
    )
    rules.check(
        snap.type == "epic" or snap.parent_id is not None or snap.module_id is not None,
        "placement", ESeverity.INFO,
        "The item hangs off nothing — no parent and no module.",
        "File it under an epic or assign it to a module so it rolls up somewhere.",
    )
    return has_outcome and has_description, has_criteria


def _is_plannable(rules: _Rules, snap: Snapshot) -> None:
    """What committed work owes the plan: an owner, a date, an estimate."""
    if snap.status != "done":
        rules.check(
            snap.priority is not None, "priority", ESeverity.INFO,
            "No priority set.", "Set a priority so ordering is not guesswork.",
        )
    if not snap.committed and snap.status not in ("in_progress", "in_review"):
        return
    rules.check(
        snap.assignee_id is not None, "owner", ESeverity.ERROR,
        "Committed work with no owner — nobody is accountable for it.",
        "Assign it, or move it back to the backlog.",
    )
    rules.check(
        snap.estimated, "estimate", ESeverity.INFO,
        "Committed work with no estimate.",
        "Estimate it, or switch the project to the estimate-free planning method.",
    )
    rules.check(
        snap.target_date is not None, "target_date", ESeverity.WARNING,
        "Committed work with no target date — it cannot slip visibly.",
        "Set a target date so the forecast can see it.",
    )


def _is_consistent(rules: _Rules, snap: Snapshot, *, has_criteria: bool) -> None:
    """Does the item contradict itself, or the state it claims to be in?"""
    if snap.start_date and snap.target_date:
        rules.check(
            snap.start_date <= snap.target_date, "date_order", ESeverity.ERROR,
            f"Start date {snap.start_date} is after target date {snap.target_date}.",
            "Correct the dates.",
        )
    if snap.status in ("in_progress", "in_review") and snap.blocked_by:
        rules.check(
            False, "blocked_while_active", ESeverity.ERROR,
            f"In {snap.status.replace('_', ' ')} while blocked by "
            f"{', '.join(snap.blocked_by)}.",
            "Resolve the blocker, or move this back until it can proceed.",
        )
    if snap.status == "done":
        rules.check(
            has_criteria, "done_without_criteria", ESeverity.WARNING,
            "Marked done, but it never stated what done meant.",
            "Record what was delivered before closing items like this.",
            confidence=0.7,
        )


def _backlog_signals(rules: _Rules, snap: Snapshot, *, now: datetime) -> bool:
    """Judgement calls about the item's place in the backlog. Returns whether it
    looks abandoned."""
    if snap.duplicate_of:
        rules.flag(
            "duplicate_candidate", ESeverity.WARNING,
            f"Nearly the same title as {', '.join(snap.duplicate_of)}.",
            "Compare them and merge if they are the same scope.", 0.5,
        )
    stale = (
        snap.status == "todo"
        and not snap.committed
        and (now - _aware(snap.updated_at)) > STALE_AFTER
    )
    if stale:
        rules.flag(
            "obsolete_candidate", ESeverity.INFO,
            f"Untouched since {_aware(snap.updated_at).date()} and still not started.",
            "Confirm it is still wanted, or close it — a stale backlog hides the real one.",
            0.6,
        )
    return stale


def assess(snap: Snapshot, *, now: datetime) -> Assessment:
    """Grade one work item. Rules that don't apply to its state are skipped rather
    than failed — a Done item is not "missing an estimate"."""
    rules = _Rules()
    has_body, has_criteria = _describes_the_work(rules, snap)
    _is_plannable(rules, snap)
    _is_consistent(rules, snap, has_criteria=has_criteria)
    stale = _backlog_signals(rules, snap, now=now)
    return Assessment(
        code=snap.code,
        readiness=_classify(
            snap, rules.findings, has_body=has_body, has_criteria=has_criteria, stale=stale
        ),
        score=rules.score,
        findings=rules.findings,
    )


def _classify(
    snap: Snapshot, findings: list[Finding], *, has_body: bool, has_criteria: bool, stale: bool
) -> EReadiness:
    """One label for the item's state. Ordered by what a reader most needs to know:
    a blocked item's missing estimate is not the headline."""
    errors = [f for f in findings if f.severity is ESeverity.ERROR]
    if snap.blocked_by:
        return EReadiness.BLOCKED
    if snap.duplicate_of:
        return EReadiness.DUPLICATE_CANDIDATE
    if snap.status == "done":
        return EReadiness.COMPLETION_UNVERIFIED if not has_criteria else EReadiness.READY
    if snap.status == "in_review":
        return EReadiness.IN_REVIEW_VALID if not errors else EReadiness.NEEDS_CLARIFICATION
    if snap.status == "in_progress":
        return EReadiness.IN_PROGRESS_VALID if not errors else EReadiness.NEEDS_CLARIFICATION
    if stale:
        return EReadiness.OBSOLETE_CANDIDATE
    if not has_body:
        return EReadiness.DRAFT
    if not has_criteria or errors:
        return EReadiness.NEEDS_CLARIFICATION
    return EReadiness.READY


def propose_repair(assessment: Assessment) -> list[dict]:
    """Turn findings into a reviewable change set. Only fields a machine can fill
    safely appear here — a missing acceptance criterion is reported as work for a
    human, never invented."""
    machine_fixable = {
        "priority": {"field": "priority", "suggested": "medium"},
        "date_order": {"field": "start_date", "suggested": None},
        # An item cannot be in progress while something blocks it. That is a fact
        # about the two records, not a judgement about the work, so a machine may
        # propose moving it back — a human still approves it.
        "blocked_while_active": {"field": "status", "suggested": "todo"},
    }
    proposals: list[dict] = []
    for finding in assessment.findings:
        fix = machine_fixable.get(finding.rule)
        proposals.append({
            "rule": finding.rule,
            "severity": finding.severity.value,
            "reason": finding.message,
            "action": finding.recommended_action,
            "confidence": finding.confidence,
            "auto_applicable": fix is not None,
            **({"change": fix} if fix else {}),
        })
    return proposals
