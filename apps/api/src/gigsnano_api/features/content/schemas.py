from typing import Any

from pydantic import BaseModel


class ToMarkdownIn(BaseModel):
    json: dict[str, Any]


class ToMarkdownOut(BaseModel):
    markdown: str
    # Node types present in the doc that do not survive a doc->md->doc round trip.
    lossy: list[str] = []


class FromMarkdownIn(BaseModel):
    markdown: str


class ContentError(BaseModel):
    message: str
    line: int | None = None
    col: int | None = None


class FromMarkdownOut(BaseModel):
    json: dict[str, Any] | None
    errors: list[ContentError] = []
