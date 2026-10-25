from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class OffsetPageOut(BaseModel, Generic[T]):
    """Offset/limit page envelope shared by admin list endpoints."""

    items: list[T]
    total: int
    limit: int
    offset: int
