"""Plane->GigsNano import: the background-task body invoked by the router
(structurally mirrors `workspace/clone.py`'s `clone_repo`/`run_*_in_fresh_session`
split — never raises, always leaves the job in a terminal status)."""

import base64
import json
import logging
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.bmad.markdown_html import markdown_to_html
from gigsnano_api.features.importers.plane_parser import PlaneIssueRow, parse_plane_export
from gigsnano_api.features.stories.labels import set_story_labels
from gigsnano_api.lib.story_numbers import next_story_number
from gigsnano_api.models import (
    Cycle,
    EImportStatus,
    EStateGroup,
    EStoryPriority,
    EStoryRelationType,
    EStoryStatus,
    EStoryType,
    GitHubConnection,
    ImportedEntityRef,
    ImportJob,
    Module,
    Project,
    ProjectLabel,
    ProjectState,
    Story,
    StoryComment,
    StoryLink,
    StoryRelation,
    StorySubscription,
    WorkspaceMember,
)
from gigsnano_api.sync.github_issues import fetch_issues, map_issue
from gigsnano_api.sync.token_crypto import decrypt_token

logger = logging.getLogger("gigsnano.importers")

_DEFAULT_COLOR = "#94a3b8"


async def _safe_rollback(session: AsyncSession) -> None:
    try:
        await session.rollback()
    except Exception as err:  # noqa: BLE001 — best-effort cleanup only
        logger.debug("rollback during cleanup failed: %s", err)


def _empty_summary() -> dict:
    return {
        "projects_created": 0,
        "stories_created": 0,
        "stories_updated": 0,
        "cycles_created": 0,
        "modules_created": 0,
        "labels_created": 0,
        "states_created": 0,
        "skipped_drafts": 0,
        "unmatched_members": [],
        "errors": [],
    }


def _parse_date(value: str) -> date | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError as err:
        raise ValueError(f"invalid date {value!r}") from err


def _priority(value: str) -> EStoryPriority:
    try:
        return EStoryPriority((value or "").strip().lower())
    except ValueError:
        return EStoryPriority.NONE


def _status(state_name: str) -> EStoryStatus:
    name = (state_name or "").lower()
    if any(k in name for k in ("done", "completed", "cancelled")):
        return EStoryStatus.DONE
    if "progress" in name:
        return EStoryStatus.IN_PROGRESS
    if "review" in name:
        return EStoryStatus.IN_REVIEW
    return EStoryStatus.TODO


def _state_group(name: str) -> EStateGroup:
    lowered = name.lower()
    if "cancel" in lowered:
        return EStateGroup.CANCELLED
    if "done" in lowered or "completed" in lowered:
        return EStateGroup.COMPLETED
    if "progress" in lowered or "review" in lowered:
        return EStateGroup.STARTED
    return EStateGroup.BACKLOG


_RELATION_TYPES = {t.value: t for t in EStoryRelationType}


def _relation_type(value) -> EStoryRelationType:
    return _RELATION_TYPES.get(str(value or "").strip().lower(), EStoryRelationType.RELATES_TO)


def _estimate_points(value) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _safe_identifier(project_identifier: str) -> str:
    return (project_identifier or "IMP").strip().upper()[:10] or "IMP"


async def _member_name_map(session: AsyncSession, workspace_id: str) -> dict[str, str]:
    rows = (
        await session.execute(
            select(User.display_name, User.id)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(WorkspaceMember.workspace_id == workspace_id)
        )
    ).all()
    out: dict[str, str] = {}
    for name, uid in rows:
        key = (name or "").strip().lower()
        if key and key not in out:
            out[key] = uid
    return out


def _match_first(names: list[str], member_map: dict[str, str], unmatched: set[str]) -> str | None:
    if not names:
        return None
    first = names[0].strip()
    uid = member_map.get(first.lower())
    if uid is None:
        if first:
            unmatched.add(first)
        return None
    return uid


async def _get_ref(
    session: AsyncSession, workspace_id: str, entity_type: str, external_key: str
) -> ImportedEntityRef | None:
    return (
        await session.execute(
            select(ImportedEntityRef).where(
                ImportedEntityRef.workspace_id == workspace_id,
                ImportedEntityRef.entity_type == entity_type,
                ImportedEntityRef.external_key == external_key,
            )
        )
    ).scalar_one_or_none()


async def _get_or_create_project(
    session: AsyncSession, workspace_id: str, identifier: str, name: str
) -> tuple[str, bool]:
    ref = await _get_ref(session, workspace_id, "project", identifier)
    if ref is not None:
        return ref.gigsnano_id, False
    project = Project(
        workspace_id=workspace_id,
        name=(name or identifier)[:120],
        identifier=_safe_identifier(identifier),
        cover_image_url="",
    )
    session.add(project)
    await session.flush()
    session.add(
        ImportedEntityRef(
            workspace_id=workspace_id, entity_type="project",
            external_key=identifier, gigsnano_id=project.id,
        )
    )
    await session.flush()
    return project.id, True


async def _get_or_create_state(
    session: AsyncSession, workspace_id: str, project_id: str, name: str
) -> tuple[str, bool]:
    key = f"{project_id}:{name}"
    ref = await _get_ref(session, workspace_id, "state", key)
    if ref is not None:
        return ref.gigsnano_id, False
    state = ProjectState(
        project_id=project_id, name=name[:80], color=_DEFAULT_COLOR, group=_state_group(name)
    )
    session.add(state)
    await session.flush()
    session.add(
        ImportedEntityRef(
            workspace_id=workspace_id, entity_type="state", external_key=key,
            gigsnano_id=state.id,
        )
    )
    await session.flush()
    return state.id, True


async def _get_or_create_label(
    session: AsyncSession, workspace_id: str, project_id: str, name: str
) -> tuple[str, bool]:
    key = f"{project_id}:{name}"
    ref = await _get_ref(session, workspace_id, "label", key)
    if ref is not None:
        return ref.gigsnano_id, False
    label = ProjectLabel(project_id=project_id, name=name[:80], color=_DEFAULT_COLOR)
    session.add(label)
    await session.flush()
    session.add(
        ImportedEntityRef(
            workspace_id=workspace_id, entity_type="label", external_key=key,
            gigsnano_id=label.id,
        )
    )
    await session.flush()
    return label.id, True


async def _get_or_create_cycle(
    session: AsyncSession, workspace_id: str, project_id: str, name: str
) -> tuple[str, bool]:
    key = f"{project_id}:{name}"
    ref = await _get_ref(session, workspace_id, "cycle", key)
    if ref is not None:
        return ref.gigsnano_id, False
    cycle = Cycle(project_id=project_id, name=name[:120])
    session.add(cycle)
    await session.flush()
    session.add(
        ImportedEntityRef(
            workspace_id=workspace_id, entity_type="cycle", external_key=key,
            gigsnano_id=cycle.id,
        )
    )
    await session.flush()
    return cycle.id, True


async def _get_or_create_module(
    session: AsyncSession, workspace_id: str, project_id: str, name: str
) -> tuple[str, bool]:
    key = f"{project_id}:{name}"
    ref = await _get_ref(session, workspace_id, "module", key)
    if ref is not None:
        return ref.gigsnano_id, False
    module = Module(project_id=project_id, name=name[:120])
    session.add(module)
    await session.flush()
    session.add(
        ImportedEntityRef(
            workspace_id=workspace_id, entity_type="module", external_key=key,
            gigsnano_id=module.id,
        )
    )
    await session.flush()
    return module.id, True


async def _upsert_story(
    session: AsyncSession,
    workspace_id: str,
    refs: dict,
    row: PlaneIssueRow,
    member_map: dict[str, str],
    unmatched: set[str],
    counters: dict,
) -> tuple[str, bool]:
    start = _parse_date(row.start_date)
    target = _parse_date(row.target_date)
    assignee_id = _match_first(row.assignees, member_map, unmatched)
    label_ids = [lid for lid in (refs["labels"].get(n) for n in row.labels) if lid]
    cycle_id = refs["cycles"].get(row.cycles[0]) if row.cycles else None
    module_id = refs["modules"].get(row.modules[0]) if row.modules else None
    estimate_points = _estimate_points(row.estimate)
    status = _status(row.state_name)
    priority = _priority(row.priority)
    title = row.name[:300] or row.identifier

    ref = await _get_ref(session, workspace_id, "story", row.identifier)
    if ref is None:
        story = Story(
            project_id=refs["id"],
            title=title,
            status=status,
            priority=priority,
            start_date=start,
            target_date=target,
            assignee_id=assignee_id,
            cycle_id=cycle_id,
            module_id=module_id,
            estimate_points=estimate_points,
            story_number=await next_story_number(session, refs["id"], counters),
        )
        session.add(story)
        await session.flush()
        await set_story_labels(session, story.id, label_ids)
        session.add(
            ImportedEntityRef(
                workspace_id=workspace_id, entity_type="story",
                external_key=row.identifier, gigsnano_id=story.id,
            )
        )
        await session.flush()
        return story.id, True

    story = await session.get(Story, ref.gigsnano_id)
    story.title = title
    story.status = status
    story.priority = priority
    story.start_date = start
    story.target_date = target
    story.assignee_id = assignee_id
    await set_story_labels(session, story.id, label_ids)
    story.cycle_id = cycle_id
    story.module_id = module_id
    story.estimate_points = estimate_points
    await session.flush()
    return story.id, False


async def _apply_row_relations(
    session: AsyncSession,
    story_id: str,
    row: PlaneIssueRow,
    story_ids_by_identifier: dict[str, str],
    member_map: dict[str, str],
) -> None:
    story = await session.get(Story, story_id)

    if row.parent:
        parent_id = story_ids_by_identifier.get(row.parent)
        if parent_id and parent_id != story_id:
            story.parent_id = parent_id

    for link in row.links:
        if not isinstance(link, dict):
            continue
        url = str(link.get("url") or "").strip()
        if not url:
            continue
        session.add(
            StoryLink(
                story_id=story_id,
                title=str(link.get("title") or url)[:300],
                url=url[:2000],
                created_by_name=row.created_by_name or "Plane import",
            )
        )

    for rel in row.relations:
        if not isinstance(rel, dict):
            continue
        target_id = story_ids_by_identifier.get(str(rel.get("issue") or "").strip())
        if not target_id or target_id == story_id:
            continue
        rel_type = _relation_type(rel.get("type"))
        exists = (
            await session.execute(
                select(StoryRelation).where(
                    StoryRelation.story_id == story_id,
                    StoryRelation.related_story_id == target_id,
                    StoryRelation.relation_type == rel_type,
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            session.add(
                StoryRelation(
                    story_id=story_id, related_story_id=target_id, relation_type=rel_type
                )
            )

    for comment in row.comments:
        if not isinstance(comment, dict):
            continue
        body = str(comment.get("comment") or "").strip()
        if not body:
            continue
        author_name = str(comment.get("created_by") or "Unknown")
        author_id = member_map.get(author_name.strip().lower())
        session.add(
            StoryComment(
                story_id=story_id, body=body, author_id=author_id, author_name=author_name
            )
        )

    for sub_name in row.subscribers:
        uid = member_map.get(sub_name.strip().lower())
        if uid is None:
            continue
        exists = (
            await session.execute(
                select(StorySubscription).where(
                    StorySubscription.story_id == story_id,
                    StorySubscription.user_id == uid,
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            session.add(StorySubscription(story_id=story_id, user_id=uid))

    await session.flush()


async def _run_import_inner(session: AsyncSession, job: ImportJob) -> None:
    raw = base64.b64decode(job.raw_content)
    rows = parse_plane_export(raw, job.source_format)

    summary = _empty_summary()
    if not rows:
        summary["errors"].append({"row": "parse", "reason": "no rows found in upload"})
        job.summary = summary
        job.status = EImportStatus.FAILED
        return

    job.status = EImportStatus.PARSING
    await session.commit()  # ponytail: intermediate commit so a polling client observes progress
    member_map = await _member_name_map(session, job.workspace_id)
    unmatched: set[str] = set()

    job.status = EImportStatus.IMPORTING
    await session.commit()

    # Pass 1 — projects + per-project reference data (states/labels/cycles/modules).
    project_refs: dict[str, dict] = {}
    for ident in dict.fromkeys(r.project_identifier for r in rows if r.project_identifier):
        proj_name = next(
            (r.project_name for r in rows if r.project_identifier == ident and r.project_name),
            ident,
        )
        project_id, created = await _get_or_create_project(session, job.workspace_id, ident, proj_name)
        if created:
            summary["projects_created"] += 1
        project_refs[ident] = {"id": project_id, "states": {}, "labels": {}, "cycles": {}, "modules": {}}

    for row in rows:
        refs = project_refs.get(row.project_identifier)
        if refs is None:
            continue
        if row.state_name and row.state_name not in refs["states"]:
            state_id, created = await _get_or_create_state(
                session, job.workspace_id, refs["id"], row.state_name
            )
            refs["states"][row.state_name] = state_id
            if created:
                summary["states_created"] += 1
        for label in row.labels:
            if label not in refs["labels"]:
                label_id, created = await _get_or_create_label(
                    session, job.workspace_id, refs["id"], label
                )
                refs["labels"][label] = label_id
                if created:
                    summary["labels_created"] += 1
        for cyc in row.cycles:
            if cyc not in refs["cycles"]:
                cyc_id, created = await _get_or_create_cycle(
                    session, job.workspace_id, refs["id"], cyc
                )
                refs["cycles"][cyc] = cyc_id
                if created:
                    summary["cycles_created"] += 1
        for mod in row.modules:
            if mod not in refs["modules"]:
                mod_id, created = await _get_or_create_module(
                    session, job.workspace_id, refs["id"], mod
                )
                refs["modules"][mod] = mod_id
                if created:
                    summary["modules_created"] += 1

    # Pass 2 — stories, upsert by identifier. Each row isolated in a savepoint so
    # one bad row can't poison the rest of the transaction (create_story precedent).
    story_ids_by_identifier: dict[str, str] = {}
    counters: dict[str, int] = {}
    for idx, row in enumerate(rows):
        if not row.identifier:
            continue
        if row.is_draft:
            summary["skipped_drafts"] += 1
            continue
        refs = project_refs.get(row.project_identifier)
        if refs is None:
            continue
        try:
            async with session.begin_nested():
                story_id, created = await _upsert_story(
                    session, job.workspace_id, refs, row, member_map, unmatched, counters
                )
            story_ids_by_identifier[row.identifier] = story_id
            if created:
                summary["stories_created"] += 1
            else:
                summary["stories_updated"] += 1
        except Exception as err:  # noqa: BLE001 — one bad row must not abort the batch
            summary["errors"].append({"row": row.identifier or idx, "reason": str(err)})

    # Pass 3 — parent/relations/links/comments/subscriptions, now that every
    # story in this batch exists.
    for idx, row in enumerate(rows):
        if row.is_draft or not row.identifier:
            continue
        story_id = story_ids_by_identifier.get(row.identifier)
        if story_id is None:
            continue
        try:
            async with session.begin_nested():
                await _apply_row_relations(
                    session, story_id, row, story_ids_by_identifier, member_map
                )
        except Exception as err:  # noqa: BLE001 — one bad row must not abort the batch
            summary["errors"].append({"row": row.identifier or idx, "reason": str(err)})

    summary["unmatched_members"] = sorted(unmatched)
    job.summary = summary
    stories_ok = summary["stories_created"] + summary["stories_updated"]
    if summary["errors"] and stories_ok == 0:
        job.status = EImportStatus.FAILED
    elif summary["errors"]:
        job.status = EImportStatus.COMPLETED_WITH_ERRORS
    else:
        job.status = EImportStatus.COMPLETED


def _empty_github_summary() -> dict:
    return {
        "issues_created": 0,
        "issues_skipped": 0,
        "labels_created": 0,
        "unassigned_logins": [],
        "notes": [
            "milestone -> cycle/module mapping not implemented (v1)",
            "assignee matched by GitHub login not implemented — no User.github_username "
            "column exists yet (v1 gap); imported issues are left unassigned",
        ],
    }


async def _run_github_import_inner(session: AsyncSession, job: ImportJob) -> None:
    """GitHub-issues connector (GIN-23b) — reuses the same ImportJob row/status
    machinery and `ImportedEntityRef` idempotency map as the Plane importer above;
    no schema redesign. `job.raw_content` holds the JSON config (owner/repo/project_id)
    instead of an uploaded file for this source_format."""
    config = json.loads(job.raw_content)
    owner, repo, project_id = config["owner"], config["repo"], config["project_id"]
    summary = _empty_github_summary()

    connection = (
        await session.execute(
            select(GitHubConnection).where(GitHubConnection.workspace_id == job.workspace_id)
        )
    ).scalar_one_or_none()
    if connection is None or not connection.access_token_encrypted:
        summary["notes"].insert(0, "GitHub not connected for this workspace")
        job.summary = summary
        job.status = EImportStatus.FAILED
        return

    job.status = EImportStatus.IMPORTING
    await session.commit()

    token = decrypt_token(connection.access_token_encrypted)
    issues = await fetch_issues(token, owner, repo)

    counters: dict[str, int] = {}
    unassigned: set[str] = set()
    for issue in issues:
        mapped = map_issue(issue)
        external_key = f"{owner}/{repo}#{mapped['number']}"
        ref = await _get_ref(session, job.workspace_id, "story", external_key)
        if ref is not None:
            summary["issues_skipped"] += 1
            continue

        label_ids: list[str] = []
        for name in mapped["labels"]:
            label_id, created = await _get_or_create_label(
                session, job.workspace_id, project_id, name
            )
            label_ids.append(label_id)
            if created:
                summary["labels_created"] += 1

        if mapped["assignee_login"]:
            unassigned.add(mapped["assignee_login"])

        story = Story(
            project_id=project_id,
            title=mapped["title"] or f"Issue #{mapped['number']}",
            description=markdown_to_html(mapped["body_markdown"]),
            status=EStoryStatus.DONE if mapped["is_closed"] else EStoryStatus.TODO,
            type=EStoryType.TASK,
            story_number=await next_story_number(session, project_id, counters),
        )
        session.add(story)
        await session.flush()
        await set_story_labels(session, story.id, label_ids)
        session.add(
            ImportedEntityRef(
                workspace_id=job.workspace_id, entity_type="story",
                external_key=external_key, gigsnano_id=story.id,
            )
        )
        if mapped["html_url"]:
            session.add(
                StoryLink(
                    story_id=story.id, title="View on GitHub", url=mapped["html_url"],
                    created_by_name="GitHub import",
                )
            )
        await session.flush()
        summary["issues_created"] += 1

    summary["unassigned_logins"] = sorted(unassigned)
    if summary["issues_created"] == 0 and summary["issues_skipped"] > 0:
        summary["notes"].append(
            "All issues already imported (this repo was imported before in this workspace)."
        )
    job.summary = summary
    job.status = EImportStatus.COMPLETED


async def run_import(session: AsyncSession, job_id: str) -> None:
    """Background-task body. Must never raise — any failure lands on
    `job.status = FAILED` with a reason recorded in `job.summary`."""
    try:
        job = await session.get(ImportJob, job_id)
        if job is None:
            return
        if job.source_format == "github":
            await _run_github_import_inner(session, job)
        else:
            await _run_import_inner(session, job)
        await session.commit()
    except Exception as err:  # noqa: BLE001 — status carries the failure, never propagate
        logger.exception("import failed for job %s", job_id)
        await _safe_rollback(session)
        try:
            job = await session.get(ImportJob, job_id)
            if job is not None:
                job.status = EImportStatus.FAILED
                job.summary = {"errors": [{"row": "job", "reason": str(err)}]}
                await session.commit()
        except Exception:  # noqa: BLE001 — best-effort persistence only
            await _safe_rollback(session)
