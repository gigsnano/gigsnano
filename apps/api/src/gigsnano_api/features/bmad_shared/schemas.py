
from pydantic import BaseModel


class BmadAgentOut(BaseModel):
    id: str
    name: str
    persona: str
    skill_id: str
    description: str
    workflows: list[str]
    phase: str
