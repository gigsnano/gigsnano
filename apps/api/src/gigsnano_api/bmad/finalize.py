"""Finalize transaction (spec §5.4/§6): extraction → artifact + story done +
unlock recompute + type-specific side effects, atomically."""

from fastapi import BackgroundTasks
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.auth.models import User
from gigsnano_api.bmad.break_down_epic import EpicAlreadyBrokenDown, break_down_epic
from gigsnano_api.bmad.epic_tree import create_epic_tree
from gigsnano_api.bmad.extraction import EXTRACT_INSTRUCTION, EXTRACTION_MODELS
from gigsnano_api.bmad.loader import get_registry
from gigsnano_api.bmad.prompt import build_messages, build_system
from gigsnano_api.bmad.provider import FakeProvider, LLMProvider
from gigsnano_api.bmad.unlock import apply_story_locks
from gigsnano_api.core.config import settings
from gigsnano_api.email.provider import EmailProvider
from gigsnano_api.features.notifications.router import (
    notify_project_members,
    notify_readiness_transition,
    notify_story_watchers,
    sprint_zero_complete,
)
from gigsnano_api.features.projects.router import record_activity
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    Artifact,
    ChatMessage,
    ChatThread,
    Cycle,
    EArtifactStatus,
    ECycleStatus,
    ELlmUsageOperation,
    ELlmUsageSource,
    ENotificationKind,
    EProjectActivityType,
    EReadinessResult,
    ESessionState,
    EStoryStatus,
    EStoryType,
    Project,
    Story,
    WorkflowSession,
)
from gigsnano_api.webhooks.events import dispatch_sprint_completed_if_transitioned
from gigsnano_api.webhooks.sender import WebhookSender
from gigsnano_api.workspace.artifacts import write_project_artifacts_to_disk
from gigsnano_api.workspace.digest import repo_context_block

MAX_EXTRACTION_ATTEMPTS = 3  # 1 try + 2 retries (spec §5.4)


class ExtractionFailed(Exception):
    pass


class FinalizeConflict(Exception):
    """Session is already FINALIZING/COMPLETED — route maps this to 409."""


class EpicBreakDownConflict(Exception):
    """Epic already has children — route maps this to 409."""


async def _next_version(db: AsyncSession, project_id: str, doc_type: str) -> int:
    current = (
        await db.execute(
            select(func.coalesce(func.max(Artifact.version), 0)).where(
                Artifact.project_id == project_id, Artifact.doc_type == doc_type
            )
        )
    ).scalar_one()
    return current + 1


async def _sprint_plan_context(db: AsyncSession, project_id: str) -> str:
    """Story-level ids+titles the model may reference in sprint assignments."""
    stories = (
        await db.execute(
            select(Story)
            .where(
                Story.project_id == project_id,
                Story.bmad_workflow.is_(None),
                Story.type == EStoryType.STORY,
            )
            .order_by(Story.sort_order)
        )
    ).scalars()
    lines = [f"- {s.id}: {s.title}" for s in stories.all()]
    return "<story-list>\n" + "\n".join(lines) + "\n</story-list>"


async def _apply_side_effects(
    db: AsyncSession, project: Project, story: Story, artifact: Artifact, data: dict
) -> None:
    if artifact.doc_type == "epics":
        await create_epic_tree(db, project, data)
    elif artifact.doc_type == "epic-breakdown":
        try:
            await break_down_epic(db, story, data)
        except EpicAlreadyBrokenDown as err:
            raise EpicBreakDownConflict(str(err)) from err
    elif artifact.doc_type == "readiness":
        story.bmad_readiness_result = EReadinessResult(data["verdict"])
    elif artifact.doc_type == "sprint_plan":
        for sprint_in in data["sprints"]:
            cycle = Cycle(
                project_id=project.id,
                name=sprint_in["name"],
                status=ECycleStatus.DRAFT,
            )
            db.add(cycle)
            await db.flush()
            for sid in sprint_in["story_ids"]:
                target = await db.get(Story, sid)
                if target is not None and target.project_id == project.id:
                    target.cycle_id = cycle.id


async def run_finalize(
    db: AsyncSession,
    llm: LLMProvider,
    *,
    project: Project,
    story: Story,
    thread: ChatThread,
    session: WorkflowSession,
    messages: list[ChatMessage],
    actor: User,
    workspace_slug: str,
    background: BackgroundTasks,
    sender: WebhookSender,
    email_provider: EmailProvider | None = None,
) -> Artifact:
    was_s0_complete = await sprint_zero_complete(db, project.id)
    # I1: re-fetch + row-lock the session row so a concurrent second finalize blocks here
    # (Postgres) until this transaction commits, then observes COMPLETED and is rejected —
    # closing the unlocked-read race where two requests both pass the guard and double-insert
    # epics/cycles/stories. with_for_update() is a no-op on sqlite (tests) and takes a real
    # row lock on Postgres. This is the authoritative guard; the route's own unlocked check
    # is only a fast path.
    session_id = session.id
    session = (
        await db.execute(
            select(WorkflowSession).where(WorkflowSession.id == session_id).with_for_update()
        )
    ).scalar_one()
    if session.state in (ESessionState.FINALIZING, ESessionState.COMPLETED):
        raise FinalizeConflict(f"Session is {session.state.value}")  # route maps to 409

    session.state = ESessionState.FINALIZING
    await db.commit()

    # C1: guard the ENTIRE post-FINALIZING body — extraction AND the side-effects/
    # story-done/locks/activity/final commit. Previously only the extraction loop was
    # covered, so a failure after successful extraction (IntegrityError on flush, a
    # dropped connection on the final commit, etc.) propagated as a 500 while the
    # durably-committed FINALIZING row stranded the session forever (the guard above
    # treats FINALIZING as a hard conflict). Any exception in this block now rolls back,
    # re-fetches the session (it may be expired after rollback), sets FAILED, and raises
    # ExtractionFailed so the route's existing 502 mapping applies and the story stays
    # retryable.
    try:
        spec = get_registry()[session.workflow_id]
        model = EXTRACTION_MODELS[spec.doc_type]
        context_docs = [
            a
            for a in [await db.get(Artifact, aid) for aid in session.context_artifact_ids]
            if a is not None
        ]
        extra_parts = []
        repo_block = await repo_context_block(project)
        if repo_block:
            extra_parts.append(repo_block)
        if spec.doc_type == "sprint_plan":
            extra_parts.append(await _sprint_plan_context(db, project.id))
        extra = "\n\n".join(extra_parts)
        system = build_system(spec, context_docs, extra_context=extra)
        system.append({"type": "text", "text": EXTRACT_INSTRUCTION})
        llm_messages = build_messages(messages) or [
            {"role": "user", "content": "Generate the artifact from the attached context."}
        ]

        data: dict | None = None
        extract_input_tokens: int | None = None
        extract_output_tokens: int | None = None
        for _ in range(MAX_EXTRACTION_ATTEMPTS):
            result = await llm.extract(
                system=system,
                messages=llm_messages,
                tool_name="emit_artifact",
                schema=model.model_json_schema(),
            )
            try:
                data = model.model_validate(result.data).model_dump()
                extract_input_tokens = result.input_tokens
                extract_output_tokens = result.output_tokens
                break
            except ValidationError as err:
                llm_messages = llm_messages + [
                    {"role": "assistant", "content": "emit_artifact call was invalid."},
                    {"role": "user",
                     "content": f"Your output failed validation:\n{err}\nEmit again, fixed."},
                ]
        if data is None:
            raise ExtractionFailed("Extraction failed schema validation after retries")
        is_fake = isinstance(llm, FakeProvider)
        await record_llm_usage(
            db,
            source=ELlmUsageSource.BMAD_STORY,
            operation=ELlmUsageOperation.EXTRACT,
            workspace_id=project.workspace_id,
            user_id=actor.id,
            project_id=project.id,
            story_id=story.id,
            thread_id=thread.id,
            model=settings.anthropic_model if not is_fake else "fake",
            input_tokens=extract_input_tokens,
            output_tokens=extract_output_tokens,
            is_fake=is_fake,
        )

        artifact = Artifact(
            project_id=project.id,
            doc_type=spec.doc_type,
            source_workflow=session.workflow_id,
            version=await _next_version(db, project.id, spec.doc_type),
            title=data.get("title", spec.title),
            content_md=data["markdown"],
            structured_json=(
                data
                if spec.doc_type in ("epics", "epic-breakdown", "readiness", "sprint_plan")
                else None
            ),
            status=EArtifactStatus.FINAL,
            source_story_id=story.id,
        )
        db.add(artifact)
        await db.flush()

        old_readiness = story.bmad_readiness_result
        await _apply_side_effects(db, project, story, artifact, data)

        # GIN-293: a finalized BMAD workflow IS a completed agent run — notify the
        # story's watchers (assignee + subscribers, minus the actor) as an AGENT event.
        await notify_story_watchers(
            db,
            story,
            project,
            project.workspace_id,
            workspace_slug,
            trigger_key="agent.run_completed",
            context={
                "agent": str(story.bmad_agent or "Your agent"),
                "workflow": artifact.doc_type.replace("_", " "),
                "story": story.title,
            },
            kind=ENotificationKind.AGENT,
            actor_id=actor.id,
            background=background,
            provider=email_provider,
        )

        is_break_down = session.workflow_id == "bmad-break-down-epic"

        if artifact.doc_type == "sprint_plan":
            await notify_project_members(
                db,
                project.workspace_id,
                project.id,
                trigger_key="sprint.plan_ready",
                context={"project": project.name},
                kind=ENotificationKind.SPRINT,
                href=f"/{workspace_slug}/projects/{project.id}/cycles",
                triggered_by_id=actor.id,
                background=background,
                provider=email_provider,
            )
        elif artifact.doc_type == "readiness":
            await notify_readiness_transition(
                db,
                project,
                workspace_slug,
                old=old_readiness,
                new=story.bmad_readiness_result,
                triggered_by_id=actor.id,
                background=background,
                provider=email_provider,
            )

        if is_break_down:
            stories_n = len(data.get("stories", []))
            tasks_n = sum(len(s.get("tasks", [])) for s in data.get("stories", []))
            record_activity(
                db,
                project.id,
                EProjectActivityType.STORY,
                actor,
                f"broke down epic {story.title} into {stories_n} stories and {tasks_n} tasks",
            )
        else:
            story.status = EStoryStatus.DONE
            bmad_stories = (
                await db.execute(
                    select(Story)
                    .where(Story.project_id == project.id, Story.bmad_workflow.is_not(None))
                    .order_by(Story.sort_order)
                )
            ).scalars()
            apply_story_locks(list(bmad_stories.all()), project.has_ui)
            record_activity(
                db, project.id, EProjectActivityType.STORY, actor,
                f"completed story {story.title}",
            )
            if not was_s0_complete and await sprint_zero_complete(db, project.id):
                await notify_project_members(
                    db,
                    project.workspace_id,
                    project.id,
                    trigger_key="sprint.zero_complete",
                    context={"project": project.name},
                    kind=ENotificationKind.SPRINT,
                    href=f"/{workspace_slug}/projects/{project.id}",
                    triggered_by_id=actor.id,
                    background=background,
                    provider=email_provider,
                )
            await dispatch_sprint_completed_if_transitioned(
                db, project, workspace_slug, was_s0_complete,
                background=background, sender=sender,
            )

        session.state = ESessionState.COMPLETED
        await db.commit()
        await write_project_artifacts_to_disk(db, project)
        return artifact
    except EpicBreakDownConflict:
        raise
    except Exception as err:  # noqa: BLE001 — never strand FINALIZING: always fail back cleanly
        await db.rollback()
        failed_session = await db.get(WorkflowSession, session_id)
        if failed_session is not None:
            failed_session.state = ESessionState.FAILED
            await db.commit()
        if isinstance(err, ExtractionFailed):
            raise
        raise ExtractionFailed("Finalize failed") from err
