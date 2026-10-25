"""Task classifier (GIN-227): domain + type from a task's text. Deterministic
keyword heuristic — no LLM. ponytail: named ceiling — an LLM classifier grounded
in the code graph (GIN-199) gives nuance the keyword map can't; swap in when the
keyword precision measurably falls short.

Matching is word-boundary, not substring (GIN-292): substring matching turned
prose into false hits — "catalog" fired on "catalogue", "tax" on "taxonomy".
A domain is only assigned when >=_MIN_DOMAIN_SIGNALS distinct keywords match, so
a lone generic word ("order") can't route an unrelated item with confidence."""

import re

_DOMAIN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "finance": ("payment", "invoice", "billing", "transaction", "ledger", "tax", "pci", "payout"),
    "health": ("patient", "clinical", "hipaa", "medical", "diagnosis", "health record"),
    "ecommerce": ("cart", "checkout", "catalog", "product listing", "order", "shipping"),
    "data": ("pipeline", "etl", "analytics", "warehouse", "dataset", "dashboard"),
    # Agent-platform / developer-tooling (GIN-287): agent-infrastructure work
    # (skill runtimes, MCP, execution profiles) — not product features.
    "platform": ("control plane", "execution profile", "agent skills", "skill registry",
                 "mcp", "runtime", "cross-agent", "developer tooling", "agent adapter"),
}

_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "test": ("test", "e2e", "qa", "coverage", "regression suite"),
    "docs": ("prd", "brief", "spec", "documentation", "write docs", "readme"),
    "design": ("ux", "ui", "design", "layout", "figma", "wireframe"),
    "architecture": ("architecture", "system design", "schema design", "scalab", "data model"),
    "bug": ("bug", "fix", "error", "crash", "broken", "regression"),
}
# "feature" is the fallback type.

# A domain needs at least this many distinct keyword hits to be assigned — one
# generic word is not enough evidence (GIN-292).
_MIN_DOMAIN_SIGNALS = 2


def _hits(text: str, keywords: tuple[str, ...]) -> list[str]:
    """Keywords that appear as whole words/phrases in text (case-insensitive)."""
    t = text.lower()
    return [k for k in keywords if re.search(rf"\b{re.escape(k)}\b", t)]


def classify_domain(text: str) -> tuple[str, list[str]]:
    """Return (domain, matched_keywords). Picks the domain with the most keyword
    hits, requiring >=_MIN_DOMAIN_SIGNALS; otherwise 'general' with no signals."""
    scored = [(d, _hits(text, kws)) for d, kws in _DOMAIN_KEYWORDS.items()]
    return max(
        (s for s in scored if len(s[1]) >= _MIN_DOMAIN_SIGNALS),
        key=lambda s: len(s[1]),
        default=("general", []),
    )


def classify_type(text: str) -> str:
    """Return the first task type with a keyword hit, else 'feature'."""
    return next(
        (ty for ty, kws in _TYPE_KEYWORDS.items() if _hits(text, kws)),
        "feature",
    )


def classify(text: str) -> tuple[str, str]:
    """Return (domain, task_type). Domain defaults to 'general', type to 'feature'."""
    return classify_domain(text)[0], classify_type(text)
