"""AI summary + smart-ranking hints for the daily digest (GIN-101).

Uses the same LLMProvider seam as BMAD/GigsAI to turn a computed digest into a
short, plain-text focus note — surfacing the most urgent/blocked items and a
suggested next step. Best-effort: any failure (or the keyless FakeProvider) just
yields an empty summary, so the digest still sends. The deterministic priority
sort (GIN-99) remains the ranking; the LLM adds the human-readable "what to focus
on" on top rather than reordering non-deterministically.
"""

import logging
from dataclasses import dataclass
from datetime import date

from gigsnano_api.bmad.provider import LLMProvider, TurnDelta, TurnFinal
from gigsnano_api.core.db import utcnow
from gigsnano_api.features.digests.schemas import DigestOut
from gigsnano_api.models import EStoryPriority

logger = logging.getLogger("gigsnano.digests")

# The note sits ABOVE a list that already shows every item with its project,
# priority and due date. So the prompt's whole job is to stop the model doing the
# list's job again. The first version asked for "2-3 sentences" that "call out the
# most urgent items, flag blockers, and suggest what to tackle first" — three
# tasks plus a length quota, which the model dutifully padded out by restating
# items ("X and Y are both pending") and inventing the bits it couldn't know
# ("sequence them by dependency order" — there is no dependency data).
_SYSTEM = (
    "You write the short focus note at the top of someone's daily work digest.\n"
    "\n"
    "The message you receive IS the complete digest — the whole of it. It is "
    "often short; one or two items is normal and expected, and a missing due date "
    "just means nobody set one. Nothing has been withheld from you. Write the note "
    "from exactly what you are given, however little that is.\n"
    "\n"
    "The same items are printed underneath your note, with project, priority and "
    "due date. The reader can see them. Restating them wastes the one line they'll "
    "actually read. Your job is the judgement a list can't give: what to start on, "
    "and why.\n"
    "\n"
    "Rules:\n"
    "- One sentence. Two only if the second genuinely earns its place.\n"
    "- Lead with the one item to start on, by name, and the reason — overdue, due "
    "today, someone else is waiting on it.\n"
    "- Only name another item if there's a real reason to. Never enumerate.\n"
    "- Never invent dependencies, blockers, owners, risks or sequencing that "
    "aren't in what you were given. If you don't know why something matters, don't "
    "guess at it.\n"
    "- Talk like a colleague, not a database. Don't narrate the fields — no "
    "'no urgency flags', no 'priority: none', no 'marked todo'.\n"
    "- If nothing is pressing, say so plainly and briefly. A calm note is a useful "
    "note; manufactured urgency is not.\n"
    "- Never ask a question. Never ask for more information, say anything is "
    "missing, or mention the digest, the list, or your own task. The reader is a "
    "busy person reading an email, not someone you can reply to.\n"
    "- Plain text. No markdown, no greeting, no sign-off, no preamble."
)

# Belt and braces for the rule above. The old prompt shipped notes like "I need to
# see your work digest to write a focus note. Could you provide..." — the model
# mistaking a short digest for a truncated one and asking the reader for it. The
# note is optional by design, so a note that talks about itself is worse than no
# note: drop it and send the digest clean.
_META_OPENERS = (
    "i need", "i don't", "i do not", "i cannot", "i can't", "i'm unable",
    "could you", "can you", "please provide", "please share", "to write",
    "there is no", "there are no items", "no digest", "it looks like",
)


def _is_meta(note: str) -> bool:
    low = note.strip().lower()
    if not low:
        return True
    # A focus note states; it never asks. Cheaper and more robust than trying to
    # classify intent — worst case a note quoting a "?" title is dropped, and a
    # dropped note is a non-event.
    if "?" in note:
        return True
    return low.startswith(_META_OPENERS)


def _digest_prompt(digest: DigestOut, today: date | None = None) -> str:
    """The digest as prose-ish facts.

    Deliberately not `[none, todo]`-style field dumps: the model narrates whatever
    vocabulary it's handed, and the old bracket format is exactly why notes came
    back talking about "urgency flags". Priority is omitted when it's NONE rather
    than announced, and due dates are pre-resolved against today, so the model
    reasons about "overdue by 3 days" instead of subtracting dates itself.
    """
    today = today or utcnow().date()
    lines = [f"Today is {today.isoformat()}."]
    for section in digest.sections:
        lines.append(f"\n{section.label}:")
        for item in section.items:
            notes = []
            if item.priority != EStoryPriority.NONE:
                notes.append(f"{item.priority.value} priority")
            if item.target_date:
                days = (item.target_date - today).days
                if days < 0:
                    notes.append(f"overdue by {-days} day{'s' if days != -1 else ''}")
                elif days == 0:
                    notes.append("due today")
                else:
                    notes.append(f"due in {days} day{'s' if days != 1 else ''}")
            suffix = f" ({', '.join(notes)})" if notes else ""
            lines.append(f"- {item.title} — {item.project_name}{suffix}")
    return "\n".join(lines)


@dataclass
class DigestSummary:
    """The note plus what it cost. Tokens are None when the call didn't happen or the
    provider didn't report them; the caller records usage only when they're real."""

    note: str
    input_tokens: int | None = None
    output_tokens: int | None = None


async def generate_digest_summary(
    provider: LLMProvider, digest: DigestOut, *, model: str | None = None
) -> DigestSummary:
    """A short AI focus note for the digest, empty when there's nothing pending or the
    model call fails.

    Returns tokens alongside the note so the caller can record the usage (GIN-147).
    This is a real, paid LLM call that ran unbilled and unrecorded: the loop collected
    TurnDelta text and dropped TurnFinal, which is where the token counts live.
    """
    if not digest.sections:
        return DigestSummary(note="")
    try:
        system = [{"type": "text", "text": _SYSTEM}]
        messages = [{"role": "user", "content": _digest_prompt(digest)}]
        out: list[str] = []
        in_tok: int | None = None
        out_tok: int | None = None
        async for event in provider.stream_turn(system=system, messages=messages, model=model):
            if isinstance(event, TurnDelta):
                out.append(event.text)
            elif isinstance(event, TurnFinal):
                in_tok, out_tok = event.input_tokens, event.output_tokens
        note = "".join(out).strip()
        if _is_meta(note):
            # Reason, not text: a discarded note quotes work-item titles back
            # ("...(GigsAI Screenshot & Auto-Attach)..."), and nothing else on
            # this path puts digest content into logs. Which rule tripped is the
            # whole diagnostic signal anyway.
            logger.warning(
                "digest AI note discarded as meta (reason=%s, chars=%d) for user=%s",
                "question" if "?" in note else "opener" if note else "empty",
                len(note),
                digest.user_id,
            )
            # Discarded for content, but the tokens were still spent — report them.
            return DigestSummary(note="", input_tokens=in_tok, output_tokens=out_tok)
        return DigestSummary(note=note, input_tokens=in_tok, output_tokens=out_tok)
    except Exception:  # noqa: BLE001 — the AI note is optional; never block a digest
        logger.exception("digest AI summary failed for user=%s", digest.user_id)
        return DigestSummary(note="")
