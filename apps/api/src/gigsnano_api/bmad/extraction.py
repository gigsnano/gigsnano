"""Per-doc_type extraction schemas (spec §5.4). Validation via pydantic so
schema errors can be fed back to the model on retry."""

from typing import Literal

from pydantic import BaseModel, Field

EXTRACT_INSTRUCTION = (
    "The user has approved this workflow's output. Emit the final artifact NOW by "
    "calling the emit_artifact tool with complete, well-structured content drawn "
    "from the conversation. Do not ask further questions."
)


class DocExtraction(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1)


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""


class StoryIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    priority: Literal["urgent", "high", "medium", "low", "none"] = "none"
    tasks: list[TaskIn] = []


class EpicIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    stories: list[StoryIn] = Field(min_length=1)


class EpicsExtraction(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1)
    epics: list[EpicIn] = Field(min_length=1)


class EpicBreakDownExtraction(BaseModel):
    """Stories/tasks under an existing epic — no outer epic wrapper."""

    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1)
    stories: list[StoryIn] = Field(min_length=1)


class ReadinessExtraction(BaseModel):
    verdict: Literal["pass", "concerns", "fail"]
    concerns: list[str] = []
    markdown: str = Field(min_length=1)


class SprintIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    story_ids: list[str] = []


class SprintPlanExtraction(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1)
    sprints: list[SprintIn] = Field(min_length=1)


_MARKDOWN_DOC_TYPES = (
    "brainstorm", "research", "brief", "prd", "ux", "architecture",
    "project_context", "document_project", "story_file", "other",
)

EXTRACTION_MODELS: dict[str, type[BaseModel]] = {
    **{doc_type: DocExtraction for doc_type in _MARKDOWN_DOC_TYPES},
    "epics": EpicsExtraction,
    "epic-breakdown": EpicBreakDownExtraction,
    "readiness": ReadinessExtraction,
    "sprint_plan": SprintPlanExtraction,
}


def extraction_schema(doc_type: str) -> dict:
    return EXTRACTION_MODELS[doc_type].model_json_schema()
