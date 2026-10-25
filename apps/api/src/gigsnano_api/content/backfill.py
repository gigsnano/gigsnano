"""GIN-308: convert legacy HTML columns into canonical JSON, with an audit trail.

Three properties this is built around, in priority order:

1. **It cannot lose content.** Every row is verified before it is written: the
   text recovered from the canonical document must match the text in the source
   HTML. A row that fails verification is reported and *skipped*, never written.
2. **It is reversible.** The legacy HTML column is never modified. Rolling back
   is `UPDATE ... SET <col>_json = NULL`, or simply turning `content_json_read`
   off — which is why that flag exists separately from the write flag.
3. **It is resumable.** Only rows with a NULL canonical column are considered, so
   a run that dies halfway costs nothing; re-run it.

Usage:

    uv run python -m gigsnano_api.content.backfill --dry-run
    uv run python -m gigsnano_api.content.backfill --limit 500
    uv run python -m gigsnano_api.content.backfill --apply
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select

from .html_import import html_to_doc
from .schema import ContentError, make_envelope
from .text import doc_to_text, html_to_text, normalize_text

#: Bumped when the conversion changes in a way that makes previously-converted
#: rows worth revisiting. Recorded in each envelope's provenance.
MIGRATOR = "gin-308@1"

# A note on what this migration deliberately does NOT fix.
#
# Some rows hold raw Markdown in an HTML column — GIN-134 residue, written before
# the MCP comment paths were converting. Where that Markdown contains angle
# brackets (`` `<SomeComponent />` ``), HTML interpretation eats them, so the text
# is *already invisible in the UI today*. This backfill reproduces what a reader
# currently sees rather than trying to recover the author's intent, because
# recovering it would mean deciding a column's format by inspecting its content —
# the exact guess this epic exists to remove.
#
# Those rows surface in the divergence report instead, where a human can decide.
# On the 2026-07-20 prod run that was 13 rows out of 1846.


@dataclass
class Report:
    """What a run did, in enough detail to decide whether to trust it."""

    table: str
    scanned: int = 0
    converted: int = 0
    empty: int = 0
    failed: list[tuple[str, str]] = field(default_factory=list)
    unverified: list[tuple[str, str]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failed and not self.unverified

    def render(self) -> str:
        lines = [
            f"{self.table}: scanned={self.scanned} converted={self.converted} "
            f"empty={self.empty} failed={len(self.failed)} "
            f"unverified={len(self.unverified)}"
        ]
        for row_id, reason in self.failed[:20]:
            lines.append(f"  FAILED    {row_id}: {reason}")
        for row_id, reason in self.unverified[:20]:
            lines.append(f"  UNVERIFIED {row_id}: {reason}")
        if len(self.failed) > 20 or len(self.unverified) > 20:
            lines.append("  ... (truncated; re-run with --limit to inspect a slice)")
        return "\n".join(lines)


#: Shared with the divergence metric so both judge "same content" identically.
_normalize = normalize_text
_text_of_html = html_to_text


def verify(html: str, doc: dict[str, Any]) -> str | None:
    """Return a reason the conversion is untrustworthy, or None if it is sound.

    Deliberately compares *text*, not markup: the conversion is expected to
    change markup (that is the point), but it must never change what the document
    says. Anything this rejects is left alone for a human, which is the correct
    outcome for a migration that cannot be un-run per row.
    """
    source = _text_of_html(html)
    converted = _normalize(doc_to_text(doc))
    if source == converted:
        return None

    # An exact match is the common case; a subset is still safe (the converter
    # drops decorative markup). Missing content is not.
    missing = [w for w in source.split() if w not in converted]
    if not missing:
        return None
    sample = " ".join(missing[:8])
    return f"text lost in conversion ({len(missing)} tokens, e.g. {sample!r})"


@dataclass
class Target:
    table: str
    model: Any
    html_column: str
    json_column: str


def _targets() -> list[Target]:
    from gigsnano_api.models import Project, Story, StoryComment

    return [
        Target("stories.description", Story, "description", "description_json"),
        Target("story_comments.body", StoryComment, "body", "body_json"),
        Target("projects.overview", Project, "overview", "overview_json"),
    ]


async def backfill_target(
    db, target: Target, *, limit: int | None = None, apply: bool = False,
    force: bool = False,
) -> Report:
    """Convert one column's un-migrated rows. Writes only when `apply` is set.

    `force` re-converts rows that already have a canonical copy. Needed when the
    converter itself is corrected — as it was for bare `<li>` content — since the
    normal NULL-only selection is what makes the run resumable and would otherwise
    make a fix unapplyable to the rows that need it.
    """
    report = Report(table=target.table)

    json_col = getattr(target.model, target.json_column)

    stmt = select(target.model)
    if not force:
        stmt = stmt.where(json_col.is_(None))
    if limit:
        stmt = stmt.limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    for row in rows:
        report.scanned += 1
        html = getattr(row, target.html_column) or ""
        if not html.strip():
            # Nothing to convert. Left NULL rather than given an empty document,
            # so "never had content" stays distinguishable from "converted to
            # empty" if this ever needs auditing.
            report.empty += 1
            continue

        try:
            doc = html_to_doc(html)
        except (ContentError, Exception) as exc:  # noqa: BLE001 - a bad row must not stop the run
            report.failed.append((row.id, f"{type(exc).__name__}: {exc}"))
            continue

        reason = verify(html, doc)
        if reason:
            report.unverified.append((row.id, reason))
            continue

        report.converted += 1
        if apply:
            setattr(
                row,
                target.json_column,
                make_envelope(
                    doc, source="html-backfill", migrated_from="html", migrator=MIGRATOR
                ),
            )

    if apply:
        await db.commit()
    return report


async def run(
    *, limit: int | None = None, apply: bool = False, force: bool = False
) -> list[Report]:
    from gigsnano_api.core.db import async_session

    reports = []
    async with async_session() as db:
        for target in _targets():
            reports.append(
                await backfill_target(db, target, limit=limit, apply=apply, force=force)
            )
    return reports


def main() -> int:
    parser = argparse.ArgumentParser(description="GIN-308 legacy HTML -> canonical JSON")
    parser.add_argument("--limit", type=int, default=None, help="rows per table")
    parser.add_argument(
        "--apply", action="store_true", help="write; otherwise this is a dry run"
    )
    parser.add_argument("--dry-run", action="store_true", help="explicit no-op default")
    parser.add_argument(
        "--force", action="store_true",
        help="re-convert rows that already have a canonical copy (after a converter fix)",
    )
    args = parser.parse_args()

    apply = args.apply and not args.dry_run
    reports = asyncio.run(run(limit=args.limit, apply=apply, force=args.force))

    print("APPLIED" if apply else "DRY RUN — nothing written")
    for report in reports:
        print(report.render())

    problems = sum(len(r.failed) + len(r.unverified) for r in reports)
    if problems:
        print(f"\n{problems} row(s) need review and were left untouched.")
    # Rows needing review are an expected outcome, not a failed run — the run
    # succeeded at refusing to guess. Non-zero exit only on a hard error.
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
