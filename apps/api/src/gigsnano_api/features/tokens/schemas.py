from datetime import datetime

from pydantic import BaseModel


class TokenCreate(BaseModel):
    name: str


class TokenCreatedOut(BaseModel):
    id: str
    name: str
    token: str  # plaintext -- returned exactly once, never persisted or re-shown
    created_at: datetime


class TokenOut(BaseModel):
    id: str
    name: str
    last_used_at: datetime | None
    created_at: datetime
    revoked_at: datetime | None
