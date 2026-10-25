"""Finalize-to-description: distill the thread into the story's essential
description (HTML) WITHOUT completing the story, creating an Artifact, or touching
BMAD locks. A parallel, non-destructive output target to document-finalize
(`finalize.py`). Reuses the same prompt assembly + extraction validation loop.
"""

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.extraction import DocExtraction
from gigsnano_api.bmad.loader import get_registry
from gigsnano_api.bmad.markdown_html import markdown_to_html
from gigsnano_api.bmad.prompt import build_messages, build_system
from gigsnano_api.bmad.provider import FakeProvider, LLMProvider
from gigsnano_api.core.config import settings
from gigsnano_api.llm.usage import record_llm_usage
from gigsnano_api.models import (
    Artifact,
    ChatMessage,
    ELlmUsageOperation,
    ELlmUsageSource,
    Project,
    Story,
    WorkflowSession,
)

MAX_EXTRACTION_ATTEMPTS = 3  # 1 try + 2 retries (mirrors finalize.py)

EXTRACT_DESCRIPTION_INSTRUCTION = (
    "Distill the conversation into this task's FINAL, essential description — the "
    "what, and the acceptance criteria a teammate needs to act on it. Write concise "
    "Markdown: a short summary line, then bullet points (a heading is optional). "
    "This is NOT a transcript — do not quote the chat, restate greetings, or narrate "
    "the back-and-forth. Emit it now by calling emit_artifact with `title` and "
    "`markdown`."
)


class DescriptionExtractionFailed(Exception):
    """Extraction failed schema validation after retries — route maps this to 502."""


async def run_finalize_description(
    db: AsyncSession,
    llm: LLMProvider,
    *,
    workspace_id: str,
    actor_user_id: str,
    thread_id: str,
    project: Project,
    story: Story,
    session: WorkflowSession,
    messages: list[ChatMessage],
) -> Story:
    """Distill `messages` into `story.description` (HTML) and commit. Leaves the
    session state, story status, artifacts, and BMAD locks untouched."""
    spec = get_registry()[session.workflow_id]
    context_docs = [
        a
        for a in [await db.get(Artifact, aid) for aid in session.context_artifact_ids]
        if a is not None
    ]
    system = build_system(spec, context_docs)
    system.append({"type": "text", "text": EXTRACT_DESCRIPTION_INSTRUCTION})
    llm_messages = build_messages(messages) or [
        {"role": "user", "content": "Write the task description from the attached context."}
    ]

    data: dict | None = None
    for _ in range(MAX_EXTRACTION_ATTEMPTS):
        result = await llm.extract(
            system=system,
            messages=llm_messages,
            tool_name="emit_artifact",
            schema=DocExtraction.model_json_schema(),
        )
        try:
            data = DocExtraction.model_validate(result.data).model_dump()
            break
        except ValidationError as err:
            llm_messages = llm_messages + [
                {"role": "assistant", "content": "emit_artifact call was invalid."},
                {"role": "user",
                 "content": f"Your output failed validation:\n{err}\nEmit again, fixed."},
            ]
    if data is None:
        raise DescriptionExtractionFailed(
            "Description extraction failed schema validation after retries"
        )
    is_fake = isinstance(llm, FakeProvider)
    await record_llm_usage(
        db,
        source=ELlmUsageSource.BMAD_STORY,
        operation=ELlmUsageOperation.FINALIZE_DESCRIPTION,
        workspace_id=workspace_id,
        user_id=actor_user_id,
        project_id=project.id,
        story_id=story.id,
        thread_id=thread_id,
        model=settings.anthropic_model if not is_fake else "fake",
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        is_fake=is_fake,
    )

    story.description = markdown_to_html(data["markdown"])
    await db.commit()
    return story
