"""Idempotency records for safe mutation retries (GIN-368).

An autonomous agent retries after timeouts and ambiguous responses. A record
pins one (user, workspace, key) to the response the first request produced, so a
retry with the same payload replays that response instead of creating a second
side effect. The unique constraint is the concurrency guard; the fingerprint
rejects a key reused with a different payload.
"""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from gigsnano_api.models.base import TimestampedBase

__all__ = ["IdempotencyRecord", "request_fingerprint"]


def request_fingerprint(method: str, path: str, body: dict | None) -> str:
    """Stable sha256 of the mutation's method + path + canonical body. Reusing a
    key with a different payload yields a different fingerprint → conflict."""
    canonical = json.dumps(
        {"method": method.upper(), "path": path, "body": body or {}},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


class IdempotencyRecord(TimestampedBase):
    __tablename__ = "idempotency_records"
    __table_args__ = (
        # Tenant/workspace + user isolated: a key can never be replayed across
        # users or workspaces, and the same key can't fire twice for one user/ws.
        UniqueConstraint("user_id", "workspace_id", "idem_key", name="uq_idempotency_scope_key"),
    )

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    idem_key: Mapped[str] = mapped_column(String(200))
    fingerprint: Mapped[str] = mapped_column(String(64))
    # The full JSON response the first request returned, replayed verbatim on retry.
    response_json: Mapped[str] = mapped_column(Text)
