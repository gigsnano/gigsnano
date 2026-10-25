from sqlalchemy import ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase


class ImageAsset(TimestampedBase):
    """A user-uploaded inline image (e.g. pasted/dropped into the rich editor).

    Bytes live in Postgres rather than blob storage: the app has no object store
    and the container's workspace disk is ephemeral (wiped on redeploy).

    Reads are workspace-auth'd (GIN-146) — the id is NOT a capability. It was
    once, which meant anyone holding a UUID could read any workspace's uploads.

    Scale ceiling: move to Azure Blob + signed URLs if volume outgrows the DB.
    Serving stays behind `/workspaces/{slug}/{images,files}/{id}/` partly so that
    migration never has to rewrite ids already baked into stored description HTML
    — swap what the route reads from, not the URL.
    """

    __tablename__ = "image_assets"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), default=None
    )
    file_name: Mapped[str | None] = mapped_column(String(300), default=None)
    mime_type: Mapped[str] = mapped_column(String(120))
    byte_size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
