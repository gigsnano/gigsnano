"""GIN-361: re-convert the rows that hold raw Markdown in an HTML column.

GIN-134 left a small set of rows whose Markdown was stored verbatim into a column
rendered as HTML. Where that Markdown contains angle brackets — `` `<Component />` ``,
`gantt-view-<date>.xlsx` — the renderer parses them as unknown tags and drops
them, so the text is invisible in the UI today.

GIN-308's backfill deliberately did **not** fix these: recovering the author's
intent means deciding a column's format by inspecting its content, which is the
guess GIN-297 exists to delete, and a bulk migration is the worst place to
reintroduce it.

This is the opposite situation. The affected set is closed, enumerated and
reviewed, so converting it involves no guessing at all — the ids come from a
divergence report, not from a heuristic. Which is exactly why it is a separate,
explicit, one-off script rather than a rule in the migration.

    uv run python -m gigsnano_api.content.reconvert_markdown --dry-run
    uv run python -m gigsnano_api.content.reconvert_markdown --apply
"""

from __future__ import annotations

import argparse
import asyncio
import re

from sqlalchemy import select

from .fields import divergence_of
from .html import doc_to_html
from .markdown import markdown_to_doc
from .schema import make_envelope

MIGRATOR = "gin-361@1"

_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)


def verify_markdown(source: str, doc: dict) -> str | None:
    """Guard for Markdown -> document, the mirror of the backfill's `verify`.

    The backfill's version compares raw text, which is right for HTML input: tags
    are not content. It is *wrong* for Markdown input, where the syntax is part of
    the source string — `**`, backticks and `1.` are legitimately consumed by
    conversion, so a raw comparison reports every emphasis marker as lost text.
    Run as-is against these rows it rejected 11 of 13 for exactly that.

    So this compares words made of letters. Syntax contributes none, list
    renumbering changes only digits, and an actual missing word — the failure that
    matters — still shows.
    """
    from .text import doc_to_text

    converted = set(_WORD.findall(doc_to_text(doc).lower()))
    missing = [w for w in _WORD.findall(source.lower()) if w not in converted]
    if not missing:
        return None
    sample = " ".join(dict.fromkeys(missing))[:80]
    return f"{len(missing)} word(s) lost, e.g. {sample!r}"


def _targets():
    from gigsnano_api.models import Story, StoryComment

    return [
        ("stories.description", Story, "description", "description_json"),
        ("story_comments.body", StoryComment, "body", "body_json"),
    ]


async def find_candidates(db) -> list[tuple[str, object, str, str]]:
    """Rows whose canonical copy disagrees in *text* with their HTML column.

    That disagreement is the signature of this bug: the HTML column holds markup
    the renderer eats, so the faithful conversion of it differs from the raw text.
    Using the report as the selector — rather than sniffing each row for
    Markdown-ish syntax — is what keeps this from being a guess.
    """
    found = []
    for table, model, html_col, json_col in _targets():
        rows = (
            (await db.execute(select(model).where(getattr(model, json_col).is_not(None))))
            .scalars()
            .all()
        )
        for row in rows:
            if divergence_of(row.id, html_col, getattr(row, json_col), getattr(row, html_col)):
                found.append((table, row, html_col, json_col))
    return found


async def run(*, apply: bool = False) -> list[str]:
    from gigsnano_api.core.db import async_session

    lines: list[str] = []
    async with async_session() as db:
        candidates = await find_candidates(db)
        lines.append(f"{len(candidates)} row(s) to re-convert")

        fixed = skipped = 0
        for table, row, html_col, json_col in candidates:
            source = getattr(row, html_col) or ""
            doc = markdown_to_doc(source)

            reason = verify_markdown(source, doc)
            if reason:
                lines.append(f"  SKIP {table} {row.id}: {reason}")
                skipped += 1
                continue

            html = doc_to_html(doc)
            lines.append(f"  FIX  {table} {row.id}")
            lines.append(f"       before: {source[:100]!r}")
            lines.append(f"       after:  {html[:100]!r}")
            fixed += 1

            if apply:
                setattr(row, html_col, html)
                setattr(
                    row,
                    json_col,
                    make_envelope(
                        doc, source="import", migrated_from="markdown", migrator=MIGRATOR
                    ),
                )

        if apply:
            await db.commit()
        lines.append(f"fixed={fixed} skipped={skipped}")
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description="GIN-361 re-convert raw-Markdown rows")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    lines = asyncio.run(run(apply=args.apply))
    print("APPLIED" if args.apply else "DRY RUN — nothing written")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
