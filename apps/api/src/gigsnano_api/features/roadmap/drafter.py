"""Agent roadmap drafting (GIN-207): PM/Analyst draft initiatives from the brief
and milestones from the PRD; a changelog is drafted from shipped items. All
first-pass + human-editable — same extract-validate loop as the other drafters."""

from pydantic import BaseModel, Field, ValidationError

from gigsnano_api.bmad.provider import FakeProvider, LLMProvider

_MAX_ATTEMPTS = 3


class _Initiative(BaseModel):
    title: str
    description: str = ""


class InitiativesDraft(BaseModel):
    initiatives: list[_Initiative] = Field(default_factory=list)


class _Milestone(BaseModel):
    name: str
    description: str = ""


class MilestonesDraft(BaseModel):
    milestones: list[_Milestone] = Field(default_factory=list)


class ChangelogDraft(BaseModel):
    markdown: str = ""


_INIT_SYSTEM = [{"type": "text", "text": (
    "You are Mary, the Analyst. From the project brief, propose a small set of "
    "cross-cutting Initiatives (strategic themes above epics) — a title and a "
    "one-sentence description each. Do not invent scope beyond the brief."
)}]
_MILE_SYSTEM = [{"type": "text", "text": (
    "You are John, the Product Manager. From the PRD, propose target-dated "
    "Milestones that group the work into deliverable checkpoints — a name and a "
    "one-sentence description each."
)}]
_CHANGELOG_SYSTEM = [{"type": "text", "text": (
    "You are the Scrum Master. Write a concise, user-facing release changelog in "
    "markdown from the list of shipped work items. Group related items; keep it tight."
)}]


async def _draft(provider: LLMProvider, system, text, model_cls, tool):
    messages = [{"role": "user", "content": text}]
    for _ in range(_MAX_ATTEMPTS):
        result = await provider.extract(
            system=system, messages=messages, tool_name=tool, schema=model_cls.model_json_schema()
        )
        try:
            return (model_cls.model_validate(result.data), result.input_tokens or 0,
                    result.output_tokens or 0, isinstance(provider, FakeProvider))
        except ValidationError as err:
            messages = messages + [
                {"role": "assistant", "content": f"{tool} was invalid."},
                {"role": "user", "content": f"Failed validation:\n{err}\nEmit again, fixed."},
            ]
    return model_cls(), 0, 0, isinstance(provider, FakeProvider)


async def draft_initiatives(provider, brief_text):
    return await _draft(provider, _INIT_SYSTEM, brief_text, InitiativesDraft, "emit_initiatives")


async def draft_milestones(provider, prd_text):
    return await _draft(provider, _MILE_SYSTEM, prd_text, MilestonesDraft, "emit_milestones")


async def draft_changelog(provider, version: str, titles: list[str]):
    body = f"Release {version}\nShipped items:\n" + "\n".join(f"- {t}" for t in titles)
    return await _draft(provider, _CHANGELOG_SYSTEM, body, ChangelogDraft, "emit_changelog")
