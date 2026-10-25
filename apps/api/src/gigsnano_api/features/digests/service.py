"""Daily work-digest generation + delivery (GIN-103).

`build_digest` computes a user's pending work grouped into buckets; `deliver_digest`
records a DigestDelivery (idempotent per user/day) and sends it in-app + by email
with open/click tracking; `run_workspace_digests` fans that over a workspace's
active members. The scheduler (scheduler.py) calls run over every workspace daily.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from html import escape
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.core.config import settings
from gigsnano_api.core.db import utcnow
from gigsnano_api.email.messages import email_shell
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.email.send import send_email_in_background
from gigsnano_api.features.digests.schemas import (
    DigestDeliveryOut,
    DigestItemOut,
    DigestOut,
    DigestRunResultOut,
    DigestSectionOut,
)
from gigsnano_api.features.notifications.router import notify, story_notification_href
from gigsnano_api.models import (
    ALL_WEEKDAYS,
    DEFAULT_HOUR,
    DEFAULT_TIMEZONE,
    DigestDelivery,
    DigestPreference,
    EDigestStatus,
    EDigestTemplate,
    ELlmUsageOperation,
    ELlmUsageSource,
    EMemberStatus,
    ENotificationKind,
    EStoryPriority,
    EStoryStatus,
    EWorkspaceRole,
    Project,
    PushOutbox,
    Story,
    Workspace,
    WorkspaceMember,
)

_DEFAULT_STATUSES = [EStoryStatus.TODO, EStoryStatus.IN_PROGRESS]
_DEFAULT_CHANNELS = ["email", "in_app"]
# Shared with the column defaults (models/digests.py) so "no row" and "row just
# created" can't drift apart — see the note there.
_DEFAULT_TIMEZONE = DEFAULT_TIMEZONE
_DEFAULT_HOUR = DEFAULT_HOUR


async def load_preference(db: AsyncSession, user_id: str) -> DigestPreference | None:
    return (
        await db.execute(select(DigestPreference).where(DigestPreference.user_id == user_id))
    ).scalar_one_or_none()


def effective_timezone(pref: DigestPreference | None) -> str:
    """The user's IANA zone, or UTC. Defensive on read: an unknown zone must not
    sink the scheduler for everyone else, so it degrades to UTC. Writes are
    validated (DigestPreferenceUpdate), so this only catches pre-validation rows."""
    raw = pref.timezone if pref is not None and pref.timezone else None
    if not raw:
        return _DEFAULT_TIMEZONE
    try:
        ZoneInfo(raw)
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("digest: unknown timezone %r (user=%s) — using UTC", raw, pref.user_id)
        return _DEFAULT_TIMEZONE
    return raw


def effective_hour(pref: DigestPreference | None) -> int:
    hour = pref.digest_hour if pref is not None else None
    return hour if hour is not None and 0 <= hour <= 23 else _DEFAULT_HOUR


def effective_weekdays(pref: DigestPreference | None) -> list[int]:
    raw = pref.digest_weekdays if pref is not None and pref.digest_weekdays else None
    if not raw:
        return list(ALL_WEEKDAYS)
    days = sorted({int(d) for d in raw if 0 <= int(d) <= 6})
    return days or list(ALL_WEEKDAYS)


def prefs_active_on(pref: DigestPreference | None, run_date: date) -> bool:
    """Whether the user wants a digest on `run_date` (their LOCAL date). No row ⇒
    default (every day). Time-of-day is the scheduler's call — see digest_due_date."""
    if pref is None:
        return True
    if not pref.enabled:
        return False
    return run_date.weekday() in effective_weekdays(pref)


def local_due_instant(day: date, hour: int, tz: ZoneInfo) -> datetime:
    """The UTC instant of `hour` local on `day`.

    DST-safe by construction. On a spring-forward day the chosen hour may not
    exist locally (02:00 never happens in New York on the March transition);
    zoneinfo resolves it via the pre-transition offset, so the digest lands at
    the next real local hour instead of being dropped for the day. On a
    fall-back day the hour happens twice and fold=0 picks the first — one
    digest, not two.
    """
    return datetime.combine(day, time(hour=hour), tzinfo=tz).astimezone(UTC)


# How late a digest may still go out. Wide enough to ride out a deploy or a
# restart without dropping anyone's day; narrow enough that we never deliver a
# stale one. Two things go wrong without a bound: a scheduler down till 23:00
# would mail everyone a "today's work" digest at 23:00, and — more common — any
# user who first saves preferences in the evening would get one instantly,
# because their morning instant has passed and no delivery row exists yet.
CATCH_UP_HOURS = 6


def digest_due_date(pref: DigestPreference | None, now_utc: datetime) -> date | None:
    """The user's LOCAL date if their digest is due at `now_utc`, else None.

    A window, not an exact tick match: due is anywhere in
    [local due instant, +CATCH_UP_HOURS). Exact matching would drop a day to any
    missed tick; an unbounded catch-up would deliver stale digests (see
    CATCH_UP_HOURS). Firing exactly once inside the window is the delivery
    table's job — (user, workspace, run_date) is unique, so the ~24 ticks that
    fall in it collapse to one send. The split is deliberate: this decides
    *whether it's time*, the DB decides *whether it already happened*.
    """
    if pref is not None and not pref.enabled:
        return None
    tz = ZoneInfo(effective_timezone(pref))
    local_date = now_utc.astimezone(tz).date()
    if local_date.weekday() not in effective_weekdays(pref):
        return None
    due = local_due_instant(local_date, effective_hour(pref), tz)
    return local_date if due <= now_utc < due + timedelta(hours=CATCH_UP_HOURS) else None


def effective_statuses(pref: DigestPreference | None) -> list[EStoryStatus]:
    raw = pref.statuses if pref and pref.statuses else None
    if not raw:
        return list(_DEFAULT_STATUSES)
    return [EStoryStatus(s) for s in raw]


def effective_channels(pref: DigestPreference | None) -> list[str]:
    return list(pref.channels) if pref and pref.channels else list(_DEFAULT_CHANNELS)

# Within each due-date bucket, order by urgency (GIN-99: grouped by priority + due).
_PRIORITY_RANK = {
    EStoryPriority.URGENT: 0,
    EStoryPriority.HIGH: 1,
    EStoryPriority.MEDIUM: 2,
    EStoryPriority.LOW: 3,
    EStoryPriority.NONE: 4,
}

logger = logging.getLogger("gigsnano.digests")

# Buckets, in the order they appear in the digest. Each item lands in the FIRST
# matching bucket, so sections never double-count.
_SECTION_LABELS = {
    "overdue": "Overdue",
    "due_today": "Due today",
    "due_soon": "Due soon",
    "in_review": "In review",
    "open": "Open",
}

# Role-based layout (GIN-102). Each template is an ordered (bucket_key, label)
# list — a reordering/relabel of the SAME five buckets by persona emphasis.
# ponytail: reshaping only, not team-wide analytics — a per-assignee digest can't
# compute team capacity/dependencies. Upgrade path: a manager roll-up query if
# managers ever need cross-assignee data.
_TEMPLATE_SECTIONS: dict[EDigestTemplate, list[tuple[str, str]]] = {
    EDigestTemplate.DEFAULT: list(_SECTION_LABELS.items()),
    EDigestTemplate.MANAGER: [  # cycle health: what's slipping, first
        ("overdue", "At risk"),
        ("due_today", "Due today"),
        ("due_soon", "Due soon"),
        ("in_review", "In review"),
        ("open", "Open"),
    ],
    EDigestTemplate.DEVELOPER: [  # blockers & dependencies: review/overdue first
        ("in_review", "Awaiting review / blocked"),
        ("overdue", "Overdue"),
        ("due_today", "Due today"),
        ("open", "In progress"),
        ("due_soon", "Due soon"),
    ],
    EDigestTemplate.PM: [  # milestones: upcoming due dates first
        ("due_soon", "Upcoming milestones"),
        ("due_today", "Due today"),
        ("overdue", "Slipping"),
        ("in_review", "In review"),
        ("open", "Open"),
    ],
}


def suggest_template_for_role(role: EWorkspaceRole) -> EDigestTemplate:
    """Auto-selected template for a user who hasn't chosen one (GIN-102)."""
    if role in (EWorkspaceRole.OWNER, EWorkspaceRole.ADMIN):
        return EDigestTemplate.MANAGER
    return EDigestTemplate.DEVELOPER


def effective_template(
    pref: DigestPreference | None, role: EWorkspaceRole | None = None
) -> EDigestTemplate:
    if pref is not None and pref.template:
        return EDigestTemplate(pref.template)
    if role is not None:
        return suggest_template_for_role(role)
    return EDigestTemplate.DEFAULT


def _href(story: Story, slug: str) -> str:
    return story_notification_href(slug, story.project_id, story)


async def build_digest(
    db: AsyncSession,
    workspace: Workspace,
    user: User,
    *,
    today: date | None = None,
    statuses: list[EStoryStatus] | None = None,
    template: EDigestTemplate = EDigestTemplate.DEFAULT,
) -> DigestOut:
    """A user's pending work in `workspace`, grouped. Excludes done + skipped +
    (via the global filter) soft-deleted items. `statuses` (GIN-100 pref) narrows
    to specific statuses; None means all non-done. `template` (GIN-102) picks the
    section ordering + labels."""
    today = today or utcnow().date()
    status_filter = (
        Story.status.in_(statuses) if statuses else Story.status != EStoryStatus.DONE
    )
    rows = (
        await db.execute(
            select(Story, Project.name, Project.identifier)
            .join(Project, Project.id == Story.project_id)
            .where(
                Project.workspace_id == workspace.id,
                Story.assignee_id == user.id,
                status_filter,
                Story.bmad_skipped.is_(False),
            )
            .order_by(Story.target_date.is_(None), Story.target_date)
        )
    ).all()

    buckets: dict[str, list[DigestItemOut]] = {k: [] for k in _SECTION_LABELS}
    soon = today + timedelta(days=3)
    for story, project_name, identifier in rows:
        item = DigestItemOut(
            story_id=story.id,
            code=(
                f"{identifier}-{story.story_number}" if story.story_number is not None else None
            ),
            title=story.title,
            status=story.status,
            priority=story.priority,
            target_date=story.target_date,
            project_id=story.project_id,
            project_name=project_name,
            href=_href(story, workspace.slug),
        )
        td = story.target_date
        if td is not None and td < today:
            buckets["overdue"].append(item)
        elif td == today:
            buckets["due_today"].append(item)
        elif td is not None and today < td <= soon:
            buckets["due_soon"].append(item)
        elif story.status == EStoryStatus.IN_REVIEW:
            buckets["in_review"].append(item)
        else:
            buckets["open"].append(item)

    for items in buckets.values():
        items.sort(key=lambda it: _PRIORITY_RANK.get(it.priority, 4))
    layout = _TEMPLATE_SECTIONS.get(template, _TEMPLATE_SECTIONS[EDigestTemplate.DEFAULT])
    sections = [
        DigestSectionOut(key=key, label=label, count=len(buckets[key]), items=buckets[key])
        for key, label in layout
        if buckets[key]
    ]
    return DigestOut(
        workspace_slug=workspace.slug,
        user_id=user.id,
        generated_at=utcnow(),
        total_open=len(rows),
        sections=sections,
    )


def _track_open_pixel(delivery_id: str) -> str:
    return (
        f'<img src="{settings.app_base_url}/api/digests/track/open/{delivery_id}/" '
        'width="1" height="1" alt="" style="display:none">'
    )


def _tracked_href(delivery_id: str, to: str) -> str:
    return (
        f"{settings.app_base_url}/api/digests/track/click/{delivery_id}/"
        f"?to={quote(to, safe='')}"
    )


@dataclass
class PendingDigestEmail:
    """One workspace's digest, rendered but not yet sent (GIN-136).

    Collected across the scheduler's workspace loop so a user who belongs to
    several gets one email instead of one per workspace.
    """

    user_id: str
    email: str
    workspace_name: str
    digest: DigestOut
    delivery_id: str
    delivery: "DigestDelivery"


def _digest_subject(total_open: int) -> str:
    return f"Your daily work digest — {total_open} open item" + ("" if total_open == 1 else "s")


def _digest_body(digest: DigestOut, delivery_id: str) -> str:
    """The inner HTML for one workspace's digest — no email shell.

    Split out so several workspaces' digests can share one shell (GIN-136). Each
    body keeps its OWN delivery_id, so links and the open pixel still attribute to
    the right workspace even when several ride in one email.
    """
    parts: list[str] = []
    if digest.ai_summary:
        parts.append(
            f'<p style="margin:0 0 16px;color:#42526e;font-size:14px">'
            f"{escape(digest.ai_summary)}</p>"
        )
    for section in digest.sections:
        parts.append(
            f'<div style="margin:18px 0 6px;font-size:13px;font-weight:600;color:#172b4d">'
            f"{escape(section.label)} · {section.count}</div>"
        )
        for item in section.items:
            link = _tracked_href(delivery_id, f"{settings.app_base_url}{item.href}")
            due = f" · due {item.target_date.isoformat()}" if item.target_date else ""
            parts.append(
                f'<div style="margin:4px 0;font-size:14px">'
                f'<a href="{link}" style="color:#4f46e5;text-decoration:none">'
                f"{escape(item.title)}</a>"
                f'<span style="color:#6b778c">  {escape(item.project_name)}{escape(due)}</span>'
                "</div>"
            )
    if not digest.sections:
        parts.append(
            '<p style="margin:0;color:#42526e;font-size:14px">'
            "You're all caught up — nothing pending. 🎉</p>"
        )
    return "".join(parts) + _track_open_pixel(delivery_id)


def render_digest_email(digest: DigestOut, delivery_id: str) -> tuple[str, str]:
    """(subject, html) for a single workspace's digest email. Item links are
    click-tracked and an open pixel is appended. GIN-99/101 refine the copy +
    AI summary."""
    preheader = f"{digest.total_open} open items across your projects"
    return (
        _digest_subject(digest.total_open),
        email_shell(preheader, _digest_body(digest, delivery_id)),
    )


def render_combined_digest_email(parts: list["PendingDigestEmail"]) -> tuple[str, str]:
    """(subject, html) for one email carrying several workspaces' digests (GIN-136).

    A user belongs to N workspaces and got N emails every morning, because the
    scheduler fans over workspaces and each delivery sent its own. Nobody chose
    that; it fell out of the loop shape.

    Each workspace keeps its own pre-built digest — including the template chosen
    for the user's role *in that workspace*, which a single merged digest would
    have had to pick between — and its own delivery_id, so click and open
    tracking still attribute per workspace. Opening this email marks all of its
    digests opened, which is true: they were all in it.
    """
    total = sum(p.digest.total_open for p in parts)
    body: list[str] = []
    for part in parts:
        body.append(
            '<div style="margin:26px 0 2px;font-size:11px;font-weight:700;'
            'letter-spacing:0.06em;text-transform:uppercase;color:#6b778c">'
            f"{escape(part.workspace_name)}</div>"
        )
        body.append(_digest_body(part.digest, part.delivery_id))
    preheader = f"{total} open items across {len(parts)} workspaces"
    return _digest_subject(total), email_shell(preheader, "".join(body))


def briefing_push_text(project_healths: list[str], needs_you: int) -> str:
    """The morning-briefing sentence. Mirrors `buildHeadline` in the frontend's
    packages/core/src/briefing/headline.ts: same wording for the same counts."""
    count = len(project_healths)
    if count == 0:
        return "No projects yet."
    parts = [f"{count} {'project' if count == 1 else 'projects'} moving."]
    at_risk = sum(1 for h in project_healths if h in ("at_risk", "off_track"))
    if at_risk:
        parts.append(f"{at_risk} at risk.")
    if needs_you > 0:
        parts.append(f"{needs_you} {'needs' if needs_you == 1 else 'need'} you.")
    else:
        parts.append("Nothing needs you.")
    return " ".join(parts)


async def _briefing_pushed_today(db: AsyncSession, user_id: str, now: datetime) -> bool:
    start = datetime.combine(now.date(), time.min, tzinfo=UTC)
    found = await db.execute(
        select(PushOutbox.id)
        .where(
            PushOutbox.user_id == user_id,
            PushOutbox.category == "briefing",
            PushOutbox.created_at >= start,
        )
        .limit(1)
    )
    return found.scalar_one_or_none() is not None


async def enqueue_briefing_push(
    db: AsyncSession,
    workspace: Workspace,
    user: User,
    role: EWorkspaceRole | None,
    *,
    open_items: int,
) -> bool:
    """Add the morning-briefing outbox row: at most one per user per UTC day, and
    only when something needs them or they have open work. The first workspace
    the run reaches supplies the line; the title names no workspace. No commit.

    Returns True when a row was added."""
    from gigsnano_api.features.briefing.service import build_briefing
    from gigsnano_api.shared.context import WorkspaceContext

    now = utcnow()
    if await _briefing_pushed_today(db, user.id, now):
        return False
    if role is None:
        role = (
            await db.execute(
                select(WorkspaceMember.role).where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none() or EWorkspaceRole.MEMBER
    ctx = WorkspaceContext(user=user, workspace=workspace, role=role, status=EMemberStatus.ACTIVE)
    briefing = await build_briefing(db, ctx, since=now - timedelta(days=1), now=now)
    if briefing.needs_you.total == 0 and open_items == 0:
        return False
    text = briefing_push_text([p.health for p in briefing.projects], briefing.needs_you.total)
    db.add(
        PushOutbox(
            user_id=user.id,
            category="briefing",
            title="Your GigsNano briefing",
            body=text,
            data={"route": "/"},
        )
    )
    return True


async def deliver_digest(
    db: AsyncSession,
    workspace: Workspace,
    user: User,
    digest: DigestOut,
    *,
    provider: EmailProvider | None,
    run_date: date,
    channels: list[str] | None = None,
    background=None,
    email_sink: list["PendingDigestEmail"] | None = None,
    role: EWorkspaceRole | None = None,
) -> DigestDelivery:
    """Record + send one user's digest on the chosen `channels` (default email +
    in-app). Idempotent: an existing delivery for (user, workspace, run_date) is
    returned untouched (never double-sends).

    `email_sink` defers the email instead of sending it: the caller collects
    across workspaces and sends one email per user (GIN-136). The in-app channel
    is unaffected — it's already per-workspace and costs the reader nothing."""
    existing = (
        await db.execute(
            select(DigestDelivery).where(
                DigestDelivery.user_id == user.id,
                DigestDelivery.workspace_id == workspace.id,
                DigestDelivery.run_date == run_date,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    wanted = channels if channels is not None else _DEFAULT_CHANNELS
    subject, _ = render_digest_email(digest, delivery_id="")  # subject only

    sent: list[str] = []
    delivery = DigestDelivery(
        workspace_id=workspace.id,
        user_id=user.id,
        run_date=run_date,
        status=EDigestStatus.PENDING,
        channels=[],
        item_count=digest.total_open,
        subject=subject,
    )
    db.add(delivery)
    await db.flush()  # need delivery.id for the tracked email

    if "in_app" in wanted:
        await notify(
            db,
            workspace.id,
            receiver_id=user.id,
            kind=ENotificationKind.SYSTEM,
            title=subject,
            body=_summary_line(digest),
            href=f"/{workspace.slug}/work-items",
        )
        sent.append("in_app")

    if "push" in wanted and await enqueue_briefing_push(
        db, workspace, user, role, open_items=digest.total_open
    ):
        sent.append("push")

    # user.email_digest is the account-level email opt-out set by the unsubscribe
    # link, which promises "you've been unsubscribed from notification emails".
    # notify_from_template already honours it; this path did not, so unsubscribing
    # silenced the one-off notifications and left the recurring digest — the mail
    # you'd unsubscribe over — still arriving (GIN-145). It gates the email channel
    # only: the opt-out is about mail, and the in-app digest costs the reader
    # nothing. Transactional mail (reset, invite) deliberately ignores this flag.
    if "email" in wanted and provider is not None and user.email and user.email_digest:
        if email_sink is not None:
            # Deferred: the caller is running several workspaces and will send this
            # user ONE email for all of them (GIN-136). body_html is set by the
            # flush, once it knows what actually left the building.
            email_sink.append(
                PendingDigestEmail(
                    user_id=user.id,
                    email=user.email,
                    workspace_name=workspace.name,
                    digest=digest,
                    delivery_id=delivery.id,
                    delivery=delivery,
                )
            )
        else:
            _, html = render_digest_email(digest, delivery_id=delivery.id)
            delivery.body_html = html  # exactly what left the building, not a re-render
            if background is not None:
                background.add_task(send_email_in_background, provider, user.email, subject, html)
            else:
                await send_email_in_background(provider, user.email, subject, html)
        sent.append("email")

    # Kept even on the in-app-only path: the note is part of the digest, not of
    # the email, and it's the piece worth reviewing after the fact.
    delivery.ai_summary = digest.ai_summary or None
    delivery.channels = list(sent)  # new list object so the JSON column change is tracked
    delivery.status = EDigestStatus.SENT if digest.total_open else EDigestStatus.SKIPPED
    return delivery


async def flush_digest_emails(
    pending: list[PendingDigestEmail],
    provider: EmailProvider | None,
    *,
    background=None,
) -> int:
    """Send the collected digests — ONE email per user. Returns emails sent.

    This is the whole of GIN-136: a user in three workspaces used to get three
    emails every morning, because the scheduler fans over workspaces and each
    delivery sent its own. Nothing was broken; nobody chose it either.

    Grouped by user, in the order their workspaces were processed, so the email
    is stable rather than dependent on dict iteration. A user with one workspace
    gets exactly the email they got before — same subject, same body — so the
    common case is untouched.

    Each delivery's `body_html` records the combined email that actually carried
    it. It's duplicated across that user's rows, which is the honest answer to
    "what did we send you?": one email, and this was it.
    """
    if provider is None or not pending:
        return 0

    by_user: dict[str, list[PendingDigestEmail]] = {}
    for item in pending:
        by_user.setdefault(item.user_id, []).append(item)

    sent = 0
    for parts in by_user.values():
        if len(parts) == 1:
            subject, html = render_digest_email(parts[0].digest, parts[0].delivery_id)
        else:
            subject, html = render_combined_digest_email(parts)
        for part in parts:
            part.delivery.body_html = html
        if background is not None:
            background.add_task(
                send_email_in_background, provider, parts[0].email, subject, html
            )
        else:
            await send_email_in_background(provider, parts[0].email, subject, html)
        sent += 1

    if len(pending) != sent:
        logger.info(
            "digest: %d digests delivered as %d emails (rolled up per user)",
            len(pending),
            sent,
        )
    return sent


def _summary_line(digest: DigestOut) -> str:
    if not digest.sections:
        return "You're all caught up."
    return " · ".join(f"{s.count} {s.label.lower()}" for s in digest.sections)


async def run_workspace_digests(
    db: AsyncSession,
    workspace: Workspace,
    *,
    provider: EmailProvider | None,
    llm_provider=None,
    run_date: date | None = None,
    now_utc: datetime | None = None,
    background=None,
    include_empty: bool = False,
    email_sink: list[PendingDigestEmail] | None = None,
) -> DigestRunResultOut:
    """Build + deliver a digest for every active member of `workspace`. Idempotent
    per (user, day). `include_empty=False` skips users with nothing pending.

    Two modes, because the two callers want different things:
    - `now_utc` (the scheduler): each user is judged against their OWN timezone
      and hour, and delivered under their OWN local date. Users in different
      zones legitimately get different run_dates from one tick.
    - `run_date` / neither (the admin `POST .../digests/run/` trigger): force one
      date for everyone, honouring only the weekday/enabled prefs. "Send it now"
      shouldn't wait for someone's 08:00 to come round.
    """
    forced_date = run_date or utcnow().date()
    members = (
        await db.execute(
            select(User, WorkspaceMember.role)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.status == EMemberStatus.ACTIVE,
            )
        )
    ).all()

    sent = skipped = failed = 0
    for user, role in members:
        try:
            # Preference first: it decides which date this user is even being
            # judged against, so it can't wait until after the delivery lookup.
            pref = await load_preference(db, user.id)
            if now_utc is not None:
                user_date = digest_due_date(pref, now_utc)  # their local date, or not yet
                if user_date is None:
                    skipped += 1
                    continue
            else:
                user_date = forced_date
                if not prefs_active_on(pref, user_date):  # opted out / not one of their days
                    skipped += 1
                    continue
            # Idempotent: already delivered for that local date → don't rebuild/resend.
            already = (
                await db.execute(
                    select(DigestDelivery.id).where(
                        DigestDelivery.user_id == user.id,
                        DigestDelivery.workspace_id == workspace.id,
                        DigestDelivery.run_date == user_date,
                    )
                )
            ).scalar_one_or_none()
            if already is not None:
                skipped += 1
                continue
            digest = await build_digest(
                db,
                workspace,
                user,
                today=user_date,
                statuses=effective_statuses(pref),
                template=effective_template(pref, role),
            )
            if digest.total_open == 0 and not include_empty:
                # No digest, but the briefing push still goes when something needs them.
                if "push" in effective_channels(pref):
                    await enqueue_briefing_push(db, workspace, user, role, open_items=0)
                skipped += 1
                continue
            if llm_provider is not None and settings.digest_ai_enabled:
                from gigsnano_api.features.digests.ai import generate_digest_summary
                from gigsnano_api.llm.usage import record_llm_usage

                summary = await generate_digest_summary(llm_provider, digest)
                digest.ai_summary = summary.note
                # This is a real paid call and ran unrecorded until GIN-147 — it was
                # invisible in the admin dashboard because it's the one LLM path with
                # no user waiting on it. Record whenever the provider reported tokens
                # (including a note discarded as meta: the tokens were still spent).
                if summary.input_tokens is not None or summary.output_tokens is not None:
                    await record_llm_usage(
                        db,
                        workspace_id=workspace.id,
                        user_id=user.id,
                        source=ELlmUsageSource.DIGEST,
                        operation=ELlmUsageOperation.STREAM_TURN,
                        model=settings.anthropic_model,
                        input_tokens=summary.input_tokens,
                        output_tokens=summary.output_tokens,
                        # Recorded, not charged: system-initiated work nobody asked
                        # for. Flip `digest_ai_billed` when the AI note becomes Pro.
                        debit=settings.digest_ai_billed,
                    )
            delivery = await deliver_digest(
                db,
                workspace,
                user,
                digest,
                provider=provider,
                run_date=user_date,
                channels=effective_channels(pref),
                background=background,
                email_sink=email_sink,
                role=role,
            )
            if delivery.status == EDigestStatus.SENT:
                sent += 1
            else:
                skipped += 1
        except Exception:  # noqa: BLE001 — one user's failure must not sink the run
            logger.exception("digest failed for user=%s ws=%s", user.id, workspace.id)
            failed += 1
    await db.commit()
    return DigestRunResultOut(
        # Reporting only. On a scheduler tick individual users are delivered under
        # their own local dates; this is the run's UTC date, not any one user's.
        run_date=forced_date,
        users_processed=len(members),
        sent=sent,
        skipped=skipped,
        failed=failed,
    )


def serialize_preference(pref: DigestPreference | None):
    from gigsnano_api.features.digests.schemas import DigestPreferenceOut

    if pref is None:
        return DigestPreferenceOut(
            enabled=True,
            timezone=_DEFAULT_TIMEZONE,
            digest_hour=_DEFAULT_HOUR,
            digest_weekdays=list(ALL_WEEKDAYS),
            template=EDigestTemplate.DEFAULT,
            statuses=list(_DEFAULT_STATUSES),
            channels=list(_DEFAULT_CHANNELS),
        )
    return DigestPreferenceOut(
        enabled=pref.enabled,
        timezone=effective_timezone(pref),
        digest_hour=effective_hour(pref),
        digest_weekdays=effective_weekdays(pref),
        template=EDigestTemplate(pref.template or "default"),
        statuses=[EStoryStatus(s) for s in (pref.statuses or [])],
        channels=list(pref.channels or []),
    )


def serialize_delivery(d: DigestDelivery) -> DigestDeliveryOut:
    return DigestDeliveryOut(
        id=d.id,
        workspace_id=d.workspace_id,
        user_id=d.user_id,
        run_date=d.run_date,
        status=d.status,
        channels=list(d.channels or []),
        item_count=d.item_count,
        subject=d.subject,
        ai_summary=d.ai_summary,
        opened_at=d.opened_at,
        clicked_at=d.clicked_at,
        created_at=d.created_at,
    )
