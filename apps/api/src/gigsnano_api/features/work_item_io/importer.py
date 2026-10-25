"""Two-pass idempotent importer + project-scoped export runner (GIN-75 A6).

Import is two-pass so a child row can reference a parent by title/code even
when the parent appears later in the same file isn't a concern here (parents
are expected to precede children in a well-formed export) -- more importantly,
two passes let us resolve "Parent" references that point at a code minted
*during this same import* (a brand-new epic + its brand-new child in one
file) without a second read of the sheet:

  Pass 1 -- upsert every row's own fields (title/type/status/... + resolved
            assignee/labels), matching existing rows by their "Code" cell.
  Pass 2 -- now that every row has a live Story (existing or freshly
            inserted), resolve "Parent" text against both the file's own
            title/code keys and the project's pre-existing codes.

Re-importing the exact export of a project must be a no-op on story *count*
(0 created, existing rows updated in place) -- see test_round_trip_is_idempotent.
"""
from __future__ import annotations

import base64
import logging
from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.features.stories.labels import load_story_label_ids, set_story_labels
from gigsnano_api.features.stories.service import _insert_story
from gigsnano_api.features.work_item_io.columns import (
    Column,
    RenderCtx,
    build_columns,
    columns_by_key,
)
from gigsnano_api.features.work_item_io.parse import ParsedRow, parse_rows
from gigsnano_api.features.work_item_io.render import render_csv, render_xlsx
from gigsnano_api.models import (
    EExportStatus,
    EImportStatus,
    EMemberStatus,
    ExportJob,
    ImportJob,
    Project,
    ProjectCustomField,
    ProjectLabel,
    Story,
    StoryCustomFieldValue,
    StoryLabel,
    WorkspaceMember,
)
from gigsnano_api.shared.serializers import load_custom_values

# Column keys that map straight onto a Story attribute of the same name (via
# COLUMN_BY_KEY[key].field) once parsed/coerced -- everything else (code,
# parent, assignee, labels, description) is resolved specially below.
_FIELD_COLS = ("title", "type", "status", "priority", "start_date", "target_date", "estimate")

# COLUMN_BY_KEY[key].field for each of the above (estimate -> estimate_points).
_FIELD_TO_ATTR = {
    "title": "title", "type": "type", "status": "status", "priority": "priority",
    "start_date": "start_date", "target_date": "target_date", "estimate": "estimate_points",
}

_log = logging.getLogger(__name__)


async def _safe_rollback(session: AsyncSession) -> None:
    """Best-effort rollback before a recovery commit -- mirrors
    `importers/service.py`'s helper of the same name. A prior aborted
    transaction leaves the session unable to `commit()` (PendingRollbackError)
    until it's rolled back first; this swallows any rollback-time error too,
    since we're already on the failure path."""
    try:
        await session.rollback()
    except Exception as err:  # noqa: BLE001 -- best-effort cleanup only
        _log.debug("rollback during cleanup failed: %s", err)


class _Actor:
    """Stand-in actor for jobs with no `created_by` user (e.g. a system-run
    import). `_insert_story` -> `record_activity`/`record_story_activity`
    read `.display_name` and `.avatar_url` off the actor, so a bare id-only
    stub would crash with AttributeError -- these three attributes are the
    full contract those two helpers rely on."""

    def __init__(self, uid: str | None) -> None:
        self.id = uid
        self.display_name = "Import"
        self.avatar_url = None


# ---- shared read helpers ---------------------------------------------------


async def _member_email_map(session: AsyncSession, workspace_id: str) -> dict[str, str]:
    """user_id -> email, for every ACTIVE member of this workspace. Pending
    (not-yet-accepted) invitees are excluded -- assigning a story to one is
    rejected by the direct story API, so the importer must not do it either."""
    rows = (await session.execute(
        select(User.id, User.email)
        .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == EMemberStatus.ACTIVE,
        )
    )).all()
    return {uid: email for uid, email in rows}


async def _label_map(session: AsyncSession, project_id: str) -> dict[str, str]:
    """label_id -> name, for every label defined on this project."""
    rows = (await session.execute(
        select(ProjectLabel.id, ProjectLabel.name).where(ProjectLabel.project_id == project_id)
    )).all()
    return {lid: name for lid, name in rows}


async def project_export_stories(session: AsyncSession, project_id: str, filters: dict | None) -> list[Story]:
    """Stories to render for an export -- never the BMAD Sprint-0 planning
    cards (bmad_workflow is not None), matching the existing product-story
    exclusion used elsewhere (see stories/router.py `product_only`)."""
    stmt = (
        select(Story)
        .where(Story.project_id == project_id, Story.bmad_workflow.is_(None))
        .order_by(Story.sort_order)
    )
    if filters:
        if filters.get("status_in"):
            stmt = stmt.where(Story.status.in_(filters["status_in"]))
        if filters.get("priority_in"):
            stmt = stmt.where(Story.priority.in_(filters["priority_in"]))
        if filters.get("type_in"):
            stmt = stmt.where(Story.type.in_(filters["type_in"]))
        if filters.get("assignee_ids"):
            stmt = stmt.where(Story.assignee_id.in_(filters["assignee_ids"]))
        if filters.get("label_ids"):
            stmt = stmt.where(
                select(StoryLabel.id)
                .where(
                    StoryLabel.story_id == Story.id,
                    StoryLabel.label_id.in_(filters["label_ids"]),
                )
                .exists()
            )
    return list((await session.execute(stmt)).scalars().all())


async def _load_project_custom_fields(session: AsyncSession, project_id: str) -> list[ProjectCustomField]:
    rows = (await session.execute(
        select(ProjectCustomField)
        .where(ProjectCustomField.project_id == project_id)
        .order_by(ProjectCustomField.sort_order, ProjectCustomField.name)
    )).scalars().all()
    return list(rows)


async def resolve_columns(session: AsyncSession, project: Project) -> list[Column]:
    """The static built-in registry + one `cf:{id}` Column per project custom
    field, so export/validate/import all operate on the same project-scoped
    column set (GIN-76 2b)."""
    return build_columns(await _load_project_custom_fields(session, project.id))


async def build_render_ctx(session: AsyncSession, project: Project) -> RenderCtx:
    emails = await _member_email_map(session, project.workspace_id)
    labels = await _label_map(session, project.id)
    stories = await project_export_stories(session, project.id, None)
    code_of = {
        s.id: f"{project.identifier}-{s.story_number}"
        for s in stories if s.story_number is not None
    }
    cv = await load_custom_values(session, [s.id for s in stories])
    custom_of = {
        sid: {fid: ("" if v is None else str(v)) for fid, v in m.items()}
        for sid, m in cv.items()
    }
    return RenderCtx(
        identifier=project.identifier, email_of=emails, code_of=code_of,
        label_name_of=labels, label_ids_of=await load_story_label_ids(session, list(code_of)),
        custom_of=custom_of,
    )


# ---- resolution shared by validate + import --------------------------------


def _email_to_uid(email_of: dict[str, str]) -> dict[str, str]:
    """email (lowercased) -> user_id, inverted from the workspace member map."""
    return {v.lower(): k for k, v in email_of.items() if v}


def _name_to_lid(label_of: dict[str, str]) -> dict[str, str]:
    """label name (lowercased) -> label_id, inverted from the project label map."""
    return {v.lower(): k for k, v in label_of.items() if v}


async def _prepare(session: AsyncSession, project: Project):
    """Shared lookup tables for both validate_import and run_work_item_import:
    email -> user id, label name -> label id, "IDENT-<n>" code -> the existing
    Story (for the idempotent match-by-code), and the full list of existing
    project stories (for in-memory parent-chain/cycle checks in pass 2)."""
    email_of = await _member_email_map(session, project.workspace_id)
    label_of = await _label_map(session, project.id)
    existing = (await session.execute(
        select(Story).where(Story.project_id == project.id)
    )).scalars().all()
    code_of = {
        f"{project.identifier}-{s.story_number}": s
        for s in existing if s.story_number is not None
    }
    return _email_to_uid(email_of), _name_to_lid(label_of), code_of, existing


def _split_labels(raw: str) -> list[str]:
    return [p.strip() for p in raw.split(",") if p.strip()]


async def _upsert_custom_values(
    session: AsyncSession, story: Story, pr: ParsedRow, by_key: dict[str, Column],
) -> None:
    """Apply every `cf:{id}` cell on this row to a `StoryCustomFieldValue` row,
    once the Story is known to exist (matched or freshly inserted). A row
    whose custom cell failed to coerce never reaches here -- `parse_rows`
    already turned it into a row-level error, so the whole row was skipped
    upstream in the pass-1 loop, preserving integrity. Empty string deletes
    any existing value (or is a no-op if none exists)."""
    for key, value in pr.values.items():
        col = by_key.get(key)
        if col is None or col.custom_field_id is None:
            continue
        str_value = value if isinstance(value, str) else str(value)
        existing_cfv = (await session.execute(
            select(StoryCustomFieldValue).where(
                StoryCustomFieldValue.story_id == story.id,
                StoryCustomFieldValue.field_id == col.custom_field_id,
            )
        )).scalar_one_or_none()
        if str_value == "":
            if existing_cfv is not None:
                await session.delete(existing_cfv)
        elif existing_cfv is not None:
            existing_cfv.value = str_value
        else:
            session.add(StoryCustomFieldValue(
                story_id=story.id, field_id=col.custom_field_id, value=str_value,
            ))


def _note_unmatched(
    pr: ParsedRow,
    email_to_uid: dict[str, str],
    name_to_lid: dict[str, str],
    unmatched: set[str],
    unknown: set[str],
) -> None:
    email = (pr.raw.get("assignee") or "").lower()
    if email and email not in email_to_uid:
        unmatched.add(pr.raw["assignee"])
    for name in _split_labels(pr.raw.get("labels", "")):
        if name.lower() not in name_to_lid:
            unknown.add(name)


# ---- validate (dry-run) ----------------------------------------------------


async def validate_import(session: AsyncSession, project: Project, content: bytes, fmt: str) -> dict:
    """Preview an import with zero writes -- the route calling this (A7) shows
    the user what would happen before they commit to it."""
    cols = await resolve_columns(session, project)
    try:
        rows = parse_rows(content, fmt, columns=cols)
    except ValueError:
        return {
            "rows_total": 0, "to_create": 0, "to_update": 0,
            "errors": [{"row": 1, "reason": "unreadable file"}],
            "unmatched_assignees": [], "unknown_labels": [], "sample": [],
        }
    email_to_uid, name_to_lid, code_of, _existing = await _prepare(session, project)
    to_create = to_update = 0
    errors: list[dict] = []
    unmatched: set[str] = set()
    unknown: set[str] = set()
    sample: list[dict] = []
    for pr in rows:
        if pr.errors:
            errors.append({"row": pr.row, "reason": "; ".join(pr.errors)})
            continue
        code = pr.raw.get("code", "")
        action = "update" if code and code in code_of else "create"
        if action == "update":
            to_update += 1
        else:
            to_create += 1
        _note_unmatched(pr, email_to_uid, name_to_lid, unmatched, unknown)
        if len(sample) < 20:
            sample.append({
                "row": pr.row, "code": code or None, "title": pr.raw.get("title"),
                "type": pr.raw.get("type", "story"), "parent": pr.raw.get("parent") or None,
                "assignee": pr.raw.get("assignee") or None, "action": action,
            })
    return {
        "rows_total": len(rows), "to_create": to_create, "to_update": to_update,
        "errors": errors, "unmatched_assignees": sorted(unmatched),
        "unknown_labels": sorted(unknown), "sample": sample,
    }


# ---- import (two-pass) -----------------------------------------------------


async def run_work_item_import(session: AsyncSession, job_id: str) -> None:
    job = await session.get(ImportJob, job_id)
    if job is None:
        return
    project = await session.get(Project, job.project_id) if job.project_id else None
    if project is None:
        job.status = EImportStatus.FAILED
        job.summary = {"errors": [{"row": "job", "reason": "project not found"}]}
        await session.commit()
        return

    job.status = EImportStatus.PARSING
    await session.commit()
    try:
        content = base64.b64decode(job.raw_content)
        cols = await resolve_columns(session, project)
        rows = parse_rows(content, job.source_format, columns=cols)
    except Exception:  # noqa: BLE001 -- any parse failure fails the job, not the caller
        await _safe_rollback(session)
        job = await session.get(ImportJob, job_id)
        if job is not None:
            job.status = EImportStatus.FAILED
            job.summary = {"errors": [{"row": "job", "reason": "unreadable file"}]}
            await session.commit()
        return

    created = updated = skipped = 0
    errors: list[dict] = []
    unmatched: set[str] = set()
    unknown: set[str] = set()
    try:
        # `_prepare` (SELECTs) and the IMPORTING commit live inside this try
        # too -- a DB-layer failure here must hit the same FAILED recovery
        # path as the two-pass loop below, not escape uncaught and leave the
        # job stuck at PARSING forever.
        email_to_uid, name_to_lid, code_of, existing_stories = await _prepare(session, project)
        by_key = columns_by_key(cols)
        job.status = EImportStatus.IMPORTING
        await session.commit()

        actor_user = await session.get(User, job.created_by) if job.created_by else None
        # `_insert_story` only reads `.id`/`.display_name`/`.avatar_url` off the actor
        # (see `_Actor`'s docstring) -- the stub satisfies that contract at runtime
        # even though it isn't a `User` instance for the type checker.
        actor = cast(User, actor_user if actor_user is not None else _Actor(job.created_by))

        key_to_story: dict[str, Story] = {}  # this file's own Code/Title -> its Story (for pass 2)
        pending_parent: list[tuple[Story, str]] = []
        # id -> Story for every row touched by this project (pre-existing +
        # freshly inserted below) -- an in-memory index for the pass-2 cycle
        # guard, so it never needs a DB round-trip to walk a parent chain.
        id_to_story: dict[str, Story] = {s.id: s for s in existing_stories}

        # Pass 1 -- upsert each row's own fields.
        for pr in rows:
            if pr.errors:
                skipped += 1
                errors.append({"row": pr.row, "reason": "; ".join(pr.errors)})
                continue

            fields: dict = {}
            for key in _FIELD_COLS:
                if key in pr.values:
                    fields[_FIELD_TO_ATTR[key]] = pr.values[key]

            email = (pr.raw.get("assignee") or "").lower()
            if email:
                uid = email_to_uid.get(email)
                if uid:
                    fields["assignee_id"] = uid
                else:
                    unmatched.add(pr.raw["assignee"])

            for name in _split_labels(pr.raw.get("labels", "")):
                lid = name_to_lid.get(name.lower())
                if lid:
                    fields.setdefault("label_ids", []).append(lid)
                else:
                    unknown.add(name)

            code = pr.raw.get("code", "")
            matched = code_of.get(code) if code else None
            if matched is not None:
                # Labels aren't a column — set-replace them through the helper so an
                # import row's label list wins without touching the other fields.
                label_ids = fields.pop("label_ids", None)
                for attr, value in fields.items():
                    setattr(matched, attr, value)
                if label_ids is not None:
                    await set_story_labels(session, matched.id, label_ids)
                story = matched
                updated += 1
            else:
                story = await _insert_story(session, project, actor, fields)
                created += 1
                id_to_story[story.id] = story

            await _upsert_custom_values(session, story, pr, by_key)

            if code:
                key_to_story[code] = story
            title = pr.raw.get("title")
            if title:
                key_to_story.setdefault(title, story)
            parent_ref = pr.raw.get("parent", "")
            if parent_ref:
                pending_parent.append((story, parent_ref))

        # Pass 2 -- link parents (within-file key first, then pre-existing codes),
        # guarding against cycles (a row that would become its own ancestor).
        for story, ref in pending_parent:
            target = key_to_story.get(ref) or code_of.get(ref)
            if target is None or target.id == story.id:
                errors.append({"row": "-", "reason": f"parent not found: {ref}"})
                continue
            if _creates_cycle(story, target, id_to_story):
                errors.append({"row": "-", "reason": f"parent cycle: {ref}"})
                continue
            story.parent_id = target.id

        job.summary = {
            "rows_total": len(rows), "created": created, "updated": updated, "skipped": skipped,
            "errors": errors, "unmatched_assignees": sorted(unmatched),
            "unknown_labels": sorted(unknown),
        }
        job.status = EImportStatus.COMPLETED_WITH_ERRORS if errors else EImportStatus.COMPLETED
        await session.commit()
    except Exception as err:  # noqa: BLE001 -- job must always land in a terminal status
        await _safe_rollback(session)
        job = await session.get(ImportJob, job_id)
        if job is not None:
            job.status = EImportStatus.FAILED
            job.summary = {
                "rows_total": len(rows), "created": created, "updated": updated, "skipped": skipped,
                "errors": [{"row": "job", "reason": str(err) or "import failed"}],
                "unmatched_assignees": sorted(unmatched), "unknown_labels": sorted(unknown),
            }
            await session.commit()


def _creates_cycle(
    story: Story, target: Story, id_to_story: dict[str, Story], max_hops: int = 100
) -> bool:
    """True if linking `story.parent_id = target.id` would make `story` its
    own ancestor -- walk `target`'s existing parent chain (bounded, via the
    in-memory `id_to_story` index rather than a lazy-loaded relationship,
    which isn't safe to touch from an async session) looking for `story`.
    Self-parenting is handled by the caller before this runs."""
    node: Story | None = target
    hops = 0
    while node is not None and hops < max_hops:
        if node.id == story.id:
            return True
        node = id_to_story.get(node.parent_id) if node.parent_id else None
        hops += 1
    return False


# ---- export -----------------------------------------------------------------


async def run_work_item_export(session: AsyncSession, job_id: str) -> None:
    try:
        job = await session.get(ExportJob, job_id)
        if job is None:
            return
        project = await session.get(Project, job.project_id) if job.project_id else None
        if project is None:
            job.status = EExportStatus.FAILED
            await session.commit()
            return
        ctx = await build_render_ctx(session, project)
        stories = await project_export_stories(session, project.id, job.filters)
        cols = await resolve_columns(session, project)
        keys = job.columns or [c.key for c in cols]
        if job.format == "csv":
            job.content = render_csv(stories, keys, ctx, columns=cols)
        else:
            job.content = base64.b64encode(render_xlsx(stories, keys, ctx, columns=cols)).decode()
        job.status = EExportStatus.READY
        await session.commit()
    except Exception:  # noqa: BLE001 -- ANY failure (setup/session.get/render) fails
        # the job, not the caller -- the whole body is guarded so a DB-layer
        # crash during `session.get`/setup can never leave the job stuck
        # non-terminal (mirrors the import guard above).
        await _safe_rollback(session)
        job = await session.get(ExportJob, job_id)
        if job is not None:
            job.status = EExportStatus.FAILED
            await session.commit()


# ---- fresh-session wrappers (background-task entry points) -----------------


async def run_import_fresh(bind, job_id: str) -> None:
    """Background-task wrapper: fresh session bound to the request's engine
    (never the module-level `async_session()` -- that hits prod under tests).
    Last-resort recovery mirrors `importers/router.py`'s
    `run_import_in_fresh_session` -- if the fresh-session setup itself blows
    up (or something escapes `run_work_item_import`'s own guard), open a
    brand-new session and stamp the job FAILED so it never gets stuck
    non-terminal."""
    try:
        async with AsyncSession(bind=bind, expire_on_commit=False) as session:
            await run_work_item_import(session, job_id)
    except Exception:  # noqa: BLE001 -- last-resort: nothing else can save this job
        try:
            async with AsyncSession(bind=bind, expire_on_commit=False) as session:
                job = await session.get(ImportJob, job_id)
                if job is not None:
                    job.status = EImportStatus.FAILED
                    job.summary = {"errors": [{"row": "job", "reason": "import task crashed"}]}
                    await session.commit()
        except Exception:  # noqa: BLE001 -- nothing further can be done
            _log.exception("could not mark import job %s failed", job_id)


async def run_export_fresh(bind, job_id: str) -> None:
    """Background-task wrapper: mirrors `run_import_fresh`'s last-resort
    recovery for the export side."""
    try:
        async with AsyncSession(bind=bind, expire_on_commit=False) as session:
            await run_work_item_export(session, job_id)
    except Exception:  # noqa: BLE001 -- last-resort: nothing else can save this job
        try:
            async with AsyncSession(bind=bind, expire_on_commit=False) as session:
                job = await session.get(ExportJob, job_id)
                if job is not None:
                    job.status = EExportStatus.FAILED
                    await session.commit()
        except Exception:  # noqa: BLE001 -- nothing further can be done
            _log.exception("could not mark export job %s failed", job_id)
