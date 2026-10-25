"""AI template drafting (GIN-241): a persona drafts a work-item template from a
plain-language description of the recurring task type. Same extract-validate loop
as the automation compiler; the human edits the draft before saving."""

from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from gigsnano_api.bmad.provider import FakeProvider, LLMProvider

_MAX_ATTEMPTS = 3

_SYSTEM = [{"type": "text", "text": (
    "You draft a reusable work-item template from a description of a recurring task "
    "type. Produce a concise title, a description with acceptance criteria, a work "
    "item type and priority, and an optional checklist of sub-steps."
)}]


class _DraftFields(BaseModel):
    title: str
    description: str = ""
    type: Literal["epic", "feature", "story", "task", "bug"] = "task"
    priority: Literal["urgent", "high", "medium", "low", "none"] = "medium"


class WorkItemTemplateDraft(BaseModel):
    name: str = Field(description="A short name for the template")
    fields: _DraftFields
    checklist: list[str] = []


async def draft_work_item_template(
    provider: LLMProvider, text: str
) -> tuple[WorkItemTemplateDraft, int, int, bool]:
    messages = [{"role": "user", "content": text}]
    for _ in range(_MAX_ATTEMPTS):
        result = await provider.extract(
            system=_SYSTEM, messages=messages,
            tool_name="emit_template", schema=WorkItemTemplateDraft.model_json_schema(),
        )
        try:
            draft = WorkItemTemplateDraft.model_validate(result.data)
            return draft, result.input_tokens or 0, result.output_tokens or 0, \
                isinstance(provider, FakeProvider)
        except ValidationError as err:
            messages = messages + [
                {"role": "assistant", "content": "emit_template was invalid."},
                {"role": "user", "content": f"Failed validation:\n{err}\nEmit again, fixed."},
            ]
    return WorkItemTemplateDraft(name=text[:60], fields=_DraftFields(title=text[:120])), 0, 0, \
        isinstance(provider, FakeProvider)
