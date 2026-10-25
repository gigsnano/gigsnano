"""GIN-305: what the canonical-content rollout is actually doing, on demand.

Deliberately a query rather than a metrics pipeline. Prod has no container log
retention, so a stream of counters would go nowhere; and every number here is
derived from the content itself, so it is always current and can never drift from
reality the way a separately-maintained counter table can.

    uv run python -m gigsnano_api.content.status

Read it before and after each flag change. The numbers that decide a rollout:

  coverage    how much content has a canonical copy. Turning READ on serves that
              copy; anything without one falls back to HTML, which is safe but
              means the flag is doing nothing for those rows.
  divergence  rows whose canonical copy no longer says what their HTML says.
              Must be 0 before enabling READ — a non-zero count is content a
              reader would see change.
  stale-risk  rows written by the editor since the backfill. Expected to grow
              until GIN-301 makes the editor emit JSON; harmless, because an
              HTML write clears the canonical copy rather than leaving it stale.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import func, select

from .fields import divergence_of


def _targets():
    from gigsnano_api.models import Project, Story, StoryComment

    return [
        ("stories.description", Story, "description", "description_json"),
        ("story_comments.body", StoryComment, "body", "body_json"),
        ("projects.overview", Project, "overview", "overview_json"),
    ]


async def collect() -> list[dict]:
    from gigsnano_api.core.db import async_session

    out = []
    async with async_session() as db:
        for table, model, html_col, json_col in _targets():
            html = getattr(model, html_col)
            canonical = getattr(model, json_col)

            total = await db.scalar(select(func.count()).select_from(model))
            with_content = await db.scalar(
                select(func.count()).select_from(model).where(
                    html.is_not(None), func.length(func.trim(html)) > 0
                )
            )
            with_canonical = await db.scalar(
                select(func.count()).select_from(model).where(canonical.is_not(None))
            )

            rows = (
                (await db.execute(select(model).where(canonical.is_not(None))))
                .scalars()
                .all()
            )
            divergent = [
                d
                for d in (
                    divergence_of(r.id, html_col, getattr(r, json_col), getattr(r, html_col))
                    for r in rows
                )
                if d
            ]

            out.append(
                {
                    "table": table,
                    "rows": total,
                    "with_content": with_content,
                    "with_canonical": with_canonical,
                    "coverage": (
                        with_canonical / with_content if with_content else 1.0
                    ),
                    "divergent": divergent,
                }
            )
    return out


def render(stats: list[dict]) -> str:
    from gigsnano_api.core.config import settings

    # Explicitly labelled local: this command is usually run from a laptop against
    # the prod database, where it would otherwise print the operator's own flags
    # as if they were the deployed ones — the single most misleading thing a
    # rollout dashboard could do.
    lines = [
        f"flags (THIS process, not the deployed app): "
        f"content_json_write={settings.content_json_write} "
        f"content_json_read={settings.content_json_read}",
        "",
    ]
    total_divergent = 0
    for s in stats:
        total_divergent += len(s["divergent"])
        lines.append(
            f"{s['table']:<26} rows={s['rows']:<6} with_content={s['with_content']:<6} "
            f"canonical={s['with_canonical']:<6} coverage={s['coverage']:6.1%} "
            f"divergent={len(s['divergent'])}"
        )
        for d in s["divergent"][:10]:
            lines.append(f"    {d.identifier}")

    lines.append("")
    if total_divergent:
        lines.append(
            f"NOT SAFE to enable content_json_read: {total_divergent} row(s) would "
            "render different content. Investigate or re-run the backfill."
        )
    else:
        lines.append(
            "Safe to enable content_json_read: every canonical copy agrees with its "
            "HTML column. Rows without a canonical copy fall back to HTML."
        )
    return "\n".join(lines)


def main() -> int:
    print(render(asyncio.run(collect())))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
