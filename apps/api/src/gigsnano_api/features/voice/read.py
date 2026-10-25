"""Read-only voice commands: count, list, search, fetch, follow-up (GIN-495).

Everything here answers a question and changes nothing, which is why these run
without confirmation. The care goes somewhere else: **the spoken answer must not
say more than the query returned.**

Three habits enforce that:

- `ReadResult` carries `total`, `returned` and `truncated` together, and
  `narrate()` builds its sentence from those numbers. A spoken "you have five"
  over a truncated page of five out of forty is a lie the user acts on.
- A failed query returns a `ReadResult` with `available=False` and no items. It
  never degrades into an empty list, because "nothing is assigned to you" and "I
  couldn't check" lead to opposite decisions.
- Follow-ups store the *query definition* and cursor, never a cached item list.
  A cache would answer "which of those are overdue?" from rows the user may have
  lost access to since.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import EStoryStatus, Project, Story
from gigsnano_api.shared.context import WorkspaceContext, accessible_project_ids

#: What "pending" / "open" means, stated once. Left implicit, every surface
#: invents its own definition and the spoken count stops matching the board.
PENDING_STATUSES: tuple[EStoryStatus, ...] = (
    EStoryStatus.TODO,
    EStoryStatus.IN_PROGRESS,
    EStoryStatus.IN_REVIEW,
)

#: A page a person can hold in their head when it is read aloud.
VOICE_PAGE = 5

#: How long a result set may back a follow-up before it must be re-run.
FRESHNESS_SECONDS = 120


@dataclass(frozen=True)
class Query:
    """The definition of a result set — re-runnable, and safe to keep.

    Deliberately not the rows: re-running re-applies authorisation, so a
    follow-up cannot surface an item the user lost access to a minute ago.
    """

    project_id: str | None = None
    assignee_id: str | None = None
    statuses: tuple[EStoryStatus, ...] = ()
    types: tuple[str, ...] = ()
    priorities: tuple[str, ...] = ()
    text: str = ""
    overdue_before: date | None = None
    limit: int = VOICE_PAGE
    offset: int = 0

    def narrowed(self, **changes) -> Query:
        """A follow-up narrows the same query. Offset resets, because "only bugs"
        means from the top, not from wherever the last page happened to stop."""
        return Query(**{**self.__dict__, "offset": 0, **changes})

    def describe(self) -> str:
        """The active filters, spoken back. A follow-up that silently keeps a
        filter the user forgot is how the wrong list looks right."""
        parts = []
        if self.statuses:
            parts.append("status " + "/".join(s.value for s in self.statuses))
        if self.assignee_id:
            parts.append("one assignee")
        if self.types:
            parts.append("type " + "/".join(self.types))
        if self.priorities:
            parts.append("priority " + "/".join(self.priorities))
        if self.overdue_before:
            parts.append(f"overdue before {self.overdue_before.isoformat()}")
        if self.text:
            parts.append(f"matching {self.text!r}")
        return ", ".join(parts) or "no filters"


@dataclass
class Item:
    id: str
    code: str
    title: str
    status: str
    url: str


@dataclass
class ReadResult:
    query: Query
    items: list[Item] = field(default_factory=list)
    total: int = 0
    as_of: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    #: False when the query could not be answered. Never conflated with "empty".
    available: bool = True
    unavailable_reason: str = ""

    @property
    def returned(self) -> int:
        return len(self.items)

    @property
    def truncated(self) -> bool:
        return self.total > self.query.offset + self.returned


def _story_url(slug: str, project_id: str, story_id: str) -> str:
    return f"/{slug}/projects/{project_id}/issues/{story_id}"


async def _scope(db: AsyncSession, ctx: WorkspaceContext, q: Query) -> Select | None:
    """Base query, authorisation-filtered. None when the actor may see nothing."""
    allowed = await accessible_project_ids(db, ctx)
    if allowed is not None and not allowed:
        return None
    stmt = select(Story).join(Project, Project.id == Story.project_id).where(
        Project.workspace_id == ctx.workspace.id,
        Story.deleted_at.is_(None),
    )
    if allowed is not None:
        stmt = stmt.where(Story.project_id.in_(allowed))
    if q.project_id:
        stmt = stmt.where(Story.project_id == q.project_id)
    if q.assignee_id:
        stmt = stmt.where(Story.assignee_id == q.assignee_id)
    if q.statuses:
        stmt = stmt.where(Story.status.in_(q.statuses))
    if q.types:
        stmt = stmt.where(Story.type.in_(q.types))
    if q.priorities:
        stmt = stmt.where(Story.priority.in_(q.priorities))
    if q.text:
        stmt = stmt.where(Story.title.ilike(f"%{q.text}%"))
    if q.overdue_before:
        stmt = stmt.where(
            Story.target_date.is_not(None),
            Story.target_date < q.overdue_before,
            Story.status != EStoryStatus.DONE,
        )
    return stmt


async def run(db: AsyncSession, ctx: WorkspaceContext, q: Query) -> ReadResult:
    """Execute a read. A failure is reported, never rendered as zero results."""
    try:
        stmt = await _scope(db, ctx, q)
        if stmt is None:
            return ReadResult(query=q, total=0)

        total = (
            await db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()
        rows = (
            await db.execute(
                stmt.order_by(Story.sort_order, Story.story_number)
                .offset(q.offset)
                .limit(q.limit)
            )
        ).scalars().all()

        identifiers = dict(
            (
                await db.execute(
                    select(Project.id, Project.identifier).where(
                        Project.workspace_id == ctx.workspace.id
                    )
                )
            ).all()
        )
        return ReadResult(
            query=q,
            total=total,
            items=[
                Item(
                    id=s.id,
                    code=f"{identifiers.get(s.project_id, '?')}-{s.story_number}",
                    title=s.title,
                    status=s.status.value if hasattr(s.status, "value") else str(s.status),
                    url=_story_url(ctx.workspace.slug, s.project_id, s.id),
                )
                for s in rows
            ],
        )
    except Exception as exc:  # noqa: BLE001 — any failure must degrade to "unknown"
        return ReadResult(
            query=q, available=False, unavailable_reason=type(exc).__name__
        )


def narrate(result: ReadResult) -> str:
    """The spoken answer, built only from what the query returned.

    The truncation clause is not decoration: it is the difference between the
    user believing they have seen their work and knowing they have seen a page.
    """
    if not result.available:
        return "I couldn't check that just now, so I don't have a number for you."
    if result.total == 0:
        return f"Nothing matches — {result.query.describe()}."

    head = f"{result.total} item{'s' if result.total != 1 else ''}, {result.query.describe()}"
    if result.truncated:
        return f"{head}. Reading the first {result.returned}; say next for more."
    return f"{head}."


# ── Grounded item context (GIN-509) ──────────────────────────────────────────


@dataclass
class Section:
    """A slice of context plus whether we actually got it. A section that failed
    and a section that is empty must not render identically."""

    available: bool = True
    truncated: bool = False
    items: list[Item] = field(default_factory=list)
    note: str = ""


@dataclass
class ItemContext:
    item: Item | None = None
    parent: Item | None = None
    children: Section = field(default_factory=Section)
    as_of: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    available: bool = True


async def fetch_context(
    db: AsyncSession, ctx: WorkspaceContext, story_id: str, *, child_limit: int = VOICE_PAGE
) -> ItemContext:
    """One item with its real parent and real children.

    Children come from `parent_id`, never from code arithmetic. GIN-491's own
    children are 503, 504 and 507 — not 492, 493, 494 — so a "next N codes"
    shortcut would confidently narrate three unrelated tickets.
    """
    allowed = await accessible_project_ids(db, ctx)
    base = select(Story).join(Project, Project.id == Story.project_id).where(
        Project.workspace_id == ctx.workspace.id, Story.deleted_at.is_(None)
    )
    if allowed is not None:
        base = base.where(Story.project_id.in_(allowed))

    story = (await db.execute(base.where(Story.id == story_id))).scalar_one_or_none()
    if story is None:
        # Indistinguishable from "does not exist", on purpose: a caller must not
        # learn that an item exists in a project they cannot see.
        return ItemContext(available=False)

    identifiers = dict(
        (
            await db.execute(
                select(Project.id, Project.identifier).where(
                    Project.workspace_id == ctx.workspace.id
                )
            )
        ).all()
    )

    def to_item(row: Story) -> Item:
        return Item(
            id=row.id,
            code=f"{identifiers.get(row.project_id, '?')}-{row.story_number}",
            title=row.title,
            status=row.status.value if hasattr(row.status, "value") else str(row.status),
            url=_story_url(ctx.workspace.slug, row.project_id, row.id),
        )

    parent = None
    if story.parent_id:
        parent_row = (
            await db.execute(base.where(Story.id == story.parent_id))
        ).scalar_one_or_none()
        parent = to_item(parent_row) if parent_row else None

    child_stmt = base.where(Story.parent_id == story.id)
    child_total = (
        await db.execute(select(func.count()).select_from(child_stmt.subquery()))
    ).scalar_one()
    child_rows = (
        await db.execute(child_stmt.order_by(Story.story_number).limit(child_limit))
    ).scalars().all()

    return ItemContext(
        item=to_item(story),
        parent=parent,
        children=Section(
            items=[to_item(r) for r in child_rows],
            truncated=child_total > len(child_rows),
            note=f"{child_total} children" if child_total else "no children",
        ),
    )


def narrate_context(context: ItemContext) -> str:
    """Speak only what was fetched.

    Every clause below is conditional on the data existing. There is no template
    slot that renders as a confident empty string, which is the usual way a
    summary ends up asserting something nobody looked up.
    """
    if not context.available or context.item is None:
        return "I couldn't find that work item, or it isn't one you have access to."

    said = [f"{context.item.code}, {context.item.title}, is {context.item.status}."]
    if context.parent is not None:
        said.append(f"It sits under {context.parent.code}.")
    if not context.children.available:
        said.append("I couldn't load its children.")
    elif context.children.items:
        shown = len(context.children.items)
        said.append(
            f"It has {context.children.note}"
            + (f"; reading {shown}." if context.children.truncated else ".")
        )
    return " ".join(said)


# ── Follow-ups ───────────────────────────────────────────────────────────────


@dataclass
class ResultContext:
    """What a follow-up may refer to: the query, the cursor, and the order the
    items were announced in — never the rows themselves."""

    query: Query
    announced: list[str] = field(default_factory=list)
    at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def is_fresh(self, *, now: datetime | None = None) -> bool:
        elapsed = ((now or datetime.now(timezone.utc)) - self.at).total_seconds()
        return elapsed <= FRESHNESS_SECONDS

    def ordinal(self, position: int) -> str | None:
        """"Open the second one" — resolved against what was actually announced,
        so it stays stable even if the underlying order changes underneath."""
        index = position - 1
        return self.announced[index] if 0 <= index < len(self.announced) else None


def remember(result: ReadResult) -> ResultContext:
    return ResultContext(query=result.query, announced=[i.id for i in result.items])


class StaleResultSet(Exception):
    """The result set is too old to narrow. Re-run rather than answer from it."""


def follow_up(context: ResultContext, *, now: datetime | None = None, **changes) -> Query:
    if not context.is_fresh(now=now):
        raise StaleResultSet("result set is stale; re-run the query")
    return context.query.narrowed(**changes)


def next_page(context: ResultContext, *, now: datetime | None = None) -> Query:
    if not context.is_fresh(now=now):
        raise StaleResultSet("result set is stale; re-run the query")
    q = context.query
    return Query(**{**q.__dict__, "offset": q.offset + q.limit})


def project_changed(context: ResultContext, project_id: str | None) -> bool:
    """Moving to a different project invalidates the result context — "which of
    those are overdue" must not silently answer about the old project."""
    return project_id is not None and context.query.project_id != project_id
