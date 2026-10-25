"""Prompt assembly (spec §5.3): system = persona+instructions (cached) +
context artifacts (cached); messages = the thread history."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.bmad.loader import WorkflowSpec
from gigsnano_api.models import Artifact, ChatMessage, EArtifactStatus, EChatRole

CACHE = {"cache_control": {"type": "ephemeral"}}


def build_system(
    spec: WorkflowSpec, context_docs: list[Artifact], extra_context: str = ""
) -> list[dict]:
    blocks = [{"type": "text", "text": f"{spec.persona}\n\n{spec.instructions}", **CACHE}]
    parts = [
        f'<artifact type="{a.doc_type}" title="{a.title}">\n{a.content_md}\n</artifact>'
        for a in context_docs
    ]
    if extra_context:
        parts.append(extra_context)
    if parts:
        blocks.append({"type": "text", "text": "\n\n".join(parts), **CACHE})
    return blocks


async def gather_context(
    db: AsyncSession, project_id: str, spec: WorkflowSpec
) -> list[Artifact]:
    """Latest FINAL artifact per required_context doc_type, in spec order."""
    docs: list[Artifact] = []
    for doc_type in spec.required_context:
        artifact = (
            await db.execute(
                select(Artifact)
                .where(
                    Artifact.project_id == project_id,
                    Artifact.doc_type == doc_type,
                    Artifact.status == EArtifactStatus.FINAL,
                )
                .order_by(Artifact.version.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if artifact is not None:
            docs.append(artifact)
    return docs


def build_messages(chat_messages: list[ChatMessage]) -> list[dict]:
    msgs = [
        {"role": m.role.value, "content": m.content}
        for m in chat_messages
        if m.content.strip()
    ]
    while msgs and msgs[0]["role"] != EChatRole.USER.value:
        msgs.pop(0)  # Anthropic requires the first message to be from the user
    return msgs
