
from pydantic import BaseModel, Field


class AiAssistantPayload(BaseModel):
    """Frontend ai-assistant request: distill a title into a description.

    `project_id` (optional) scopes the generation to a project so the model
    grounds the description in that project's name/overview and existing work
    items rather than expanding the title generically.
    """

    prompt: str = Field(min_length=1, max_length=2000)
    task: str = Field(min_length=1, max_length=500)
    project_id: str | None = None


class AiAssistantOut(BaseModel):
    response_html: str
