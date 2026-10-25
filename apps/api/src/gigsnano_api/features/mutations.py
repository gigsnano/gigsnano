"""Shared mutation-safety primitives for agent-facing writes (GIN-368).

Idempotency (retry-safe writes), optimistic concurrency (no silent stale
overwrite) and structured conflict errors. Endpoints opt in with a query param;
the guarantees are enforced by the DB (unique constraint + the row's own
updated_at version), not an in-memory cache.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import IdempotencyRecord


def structured_http(
    status_code: int, error_code: str, message: str, *, retryable: bool, **extra
) -> HTTPException:
    """A machine-actionable error: stable error_code + retryable, so an agent can
    tell a transient failure from a permanent one (GIN-366/GIN-368)."""
    return HTTPException(
        status_code,
        detail={"error_code": error_code, "message": message, "retryable": retryable, **extra},
    )


async def replay_or_conflict(
    db: AsyncSession, user_id: str, workspace_id: str, key: str, fingerprint: str
) -> dict | None:
    """Return the stored response for a matching retry, None for a fresh key, or
    raise a structured 409 if the key was reused with a different payload."""
    rec = (
        await db.execute(
            select(IdempotencyRecord).where(
                IdempotencyRecord.user_id == user_id,
                IdempotencyRecord.workspace_id == workspace_id,
                IdempotencyRecord.idem_key == key,
            )
        )
    ).scalar_one_or_none()
    if rec is None:
        return None
    if rec.fingerprint != fingerprint:
        raise structured_http(
            status.HTTP_409_CONFLICT,
            "idempotency_key_conflict",
            "This idempotency_key was already used with a different request payload.",
            retryable=False,
        )
    return json.loads(rec.response_json)


async def store_idempotent(
    db: AsyncSession,
    user_id: str,
    workspace_id: str,
    key: str,
    fingerprint: str,
    response: dict,
) -> dict:
    """Persist the response under (user, workspace, key). On a concurrent-duplicate
    race the unique constraint fires; we roll back and replay the winner's stored
    response so both callers still observe exactly one side effect.

    ponytail: the story's own side effect already committed before this store, so a
    truly simultaneous double-submit can create two rows in the gap — that residual
    race is covered by the search-based duplicate check (GIN-365, AC4), not here."""
    db.add(
        IdempotencyRecord(
            user_id=user_id,
            workspace_id=workspace_id,
            idem_key=key,
            fingerprint=fingerprint,
            response_json=json.dumps(response, default=str),
        )
    )
    try:
        await db.commit()
        return response
    except IntegrityError:
        await db.rollback()
        stored = await replay_or_conflict(db, user_id, workspace_id, key, fingerprint)
        return stored if stored is not None else response


def _aware(dt: datetime) -> datetime:
    """Normalize to aware-UTC so naive (SQLite) and aware (Postgres) timestamps
    compare without a TypeError."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def parse_expected_version(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as err:
        raise structured_http(
            status.HTTP_400_BAD_REQUEST,
            "invalid_expected_version",
            "expected_updated_at must be an ISO-8601 timestamp.",
            retryable=False,
        ) from err


def assert_unchanged(
    expected: datetime | None, current: datetime, *, current_state: dict
) -> None:
    """Optimistic concurrency: raise a structured, retryable 409 if the record moved
    on since the caller last read it, so a stale write never silently clobbers a
    newer human or agent change."""
    if expected is None:
        return
    if abs((_aware(current) - _aware(expected)).total_seconds()) > 0.001:
        raise structured_http(
            status.HTTP_409_CONFLICT,
            "stale_write",
            "The item changed since you last read it; re-read it and retry.",
            retryable=True,
            current_updated_at=_aware(current).isoformat(),
            current=current_state,
        )
