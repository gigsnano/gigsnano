"""Extract a work item's explicit "Required agent skills" section (GIN-309).

Work items declare the skills they need in a `Required agent skills` list. The
router used to ignore this and infer skills only from the classified type — so an
item that spelled out `agent-routing`, `workspace-isolation`, … came back with
just `skill:testing-tdd`. Honouring the explicit list is more reliable than
keyword inference, so these are merged into the routing result.

The work-item body is HTML; this pulls the skill tokens out of the section under
the heading and normalises them to the registry's `skill:<name>` form.
"""

import re

_HEADING_RE = re.compile(r"required\s+agent\s+skills", re.IGNORECASE)
# A heading boundary in the HTML body — the section ends at the next h2/h3.
_NEXT_HEADING_RE = re.compile(r"<h[1-3][\s>]", re.IGNORECASE)
# Prefer <code>…</code> tokens (how the tickets format skill names); fall back to
# <li>…</li> text so a plainly-listed section still works.
_CODE_RE = re.compile(r"<code>([^<]+)</code>", re.IGNORECASE)
_LI_RE = re.compile(r"<li[^>]*>(.*?)</li>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")


def _normalize(token: str) -> str | None:
    """`Agent Routing` / `skill:agent-routing` → `skill:agent-routing`, or None."""
    t = _TAG_RE.sub("", token).strip().lower()
    if not t:
        return None
    t = t[len("skill:") :] if t.startswith("skill:") else t
    # Slugify: spaces/underscores → hyphens; keep [a-z0-9-] only.
    t = re.sub(r"[\s_]+", "-", t)
    t = re.sub(r"[^a-z0-9-]", "", t).strip("-")
    return f"skill:{t}" if t else None


def extract_required_skills(text: str) -> list[str]:
    """Skills explicitly required by the work item, in `skill:<name>` form, deduped
    and order-preserving. Empty when there is no such section."""
    if not text:
        return []
    m = _HEADING_RE.search(text)
    if not m:
        return []
    rest = text[m.end() :]
    end = _NEXT_HEADING_RE.search(rest)
    section = rest[: end.start()] if end else rest

    tokens = _CODE_RE.findall(section) or _LI_RE.findall(section)
    out: list[str] = []
    seen: set[str] = set()
    for tok in tokens:
        skill = _normalize(tok)
        if skill and skill not in seen:
            seen.add(skill)
            out.append(skill)
    return out
