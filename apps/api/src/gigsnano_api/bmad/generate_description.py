"""AI-assistant "generate description": distill a free-form prompt (typically a
work-item title) plus a task instruction into markdown, rendered to HTML. A
minimal sibling of `description.py::run_finalize_description` — no thread, no
DB writes, no artifact/side-effects/usage-recording (v1, YAGNI)."""

from pydantic import ValidationError

from gigsnano_api.bmad.extraction import DocExtraction
from gigsnano_api.bmad.markdown_html import markdown_to_html
from gigsnano_api.bmad.provider import ExtractResult, LLMProvider

MAX_EXTRACTION_ATTEMPTS = 3  # 1 try + 2 retries (mirrors description.py)

GENERATE_DESCRIPTION_INSTRUCTION = (
    "Distill the user's input into a clear, actionable work-item description. Write "
    "concise Markdown: a short summary line, then bullet points for acceptance "
    "criteria (a heading is optional). Do not ask questions or narrate — emit the "
    "result now by calling emit_artifact with `title` and `markdown`."
)


class GenerateDescriptionFailed(Exception):
    """Extraction failed schema validation after retries — route maps this to 502."""


async def run_generate_description(
    llm: LLMProvider, *, prompt: str, task: str, context: str | None = None
) -> tuple[str, ExtractResult]:
    """Distill `prompt`/`task` into an HTML description via the LLM provider.

    Returns `(html, result)` — the caller records usage from `result`'s token
    counts so the wallet is debited (GIN-32).

    When `context` is given (a project's name/overview/work-items block), it is
    appended to the system instruction so the description is grounded in that
    project rather than being a generic expansion of the title."""
    instruction = GENERATE_DESCRIPTION_INSTRUCTION
    if context:
        instruction += (
            "\n\nGround the description in the project context below — align "
            "terminology and scope with it, and avoid duplicating existing work "
            f"items:\n\n{context}"
        )
    system = [{"type": "text", "text": instruction}]
    messages = [{"role": "user", "content": f"Task: {task}\n\nInput: {prompt}"}]

    data: dict | None = None
    result: ExtractResult | None = None
    for _ in range(MAX_EXTRACTION_ATTEMPTS):
        result = await llm.extract(
            system=system,
            messages=messages,
            tool_name="emit_artifact",
            schema=DocExtraction.model_json_schema(),
        )
        try:
            data = DocExtraction.model_validate(result.data).model_dump()
            break
        except ValidationError as err:
            messages = messages + [
                {"role": "assistant", "content": "emit_artifact call was invalid."},
                {"role": "user",
                 "content": f"Your output failed validation:\n{err}\nEmit again, fixed."},
            ]
    if data is None or result is None:
        raise GenerateDescriptionFailed(
            "Description extraction failed schema validation after retries"
        )
    return markdown_to_html(data["markdown"]), result
