from datetime import datetime

from pydantic import BaseModel

from gigsnano_api.models import ENotificationKind


class NotificationActor(BaseModel):
    id: str
    display_name: str
    avatar_url: str | None


class NotificationProjectRef(BaseModel):
    id: str
    name: str


class NotificationOut(BaseModel):
    id: str
    workspace_slug: str
    kind: ENotificationKind
    title: str
    body: str
    href: str | None
    read: bool
    created_at: datetime
    actor: NotificationActor | None = None
    project: NotificationProjectRef | None = None


class MarkReadPayload(BaseModel):
    read: bool


class UnreadNotificationsOut(BaseModel):
    total_unread: int
    mention_unread: int
