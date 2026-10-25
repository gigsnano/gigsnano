"""GitHub push webhook: verify, match projects, schedule incremental re-index."""

from __future__ import annotations

import hashlib
import hmac

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gigsnano_api.models import Project


def verify_signature(secret: str, body: bytes, header: str | None) -> bool:
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)


def ref_branch(ref: str) -> str | None:
    prefix = "refs/heads/"
    return ref[len(prefix):] if ref.startswith(prefix) else None


async def projects_for_push(db: AsyncSession, repo_full_name: str, ref: str) -> list[str]:
    branch = ref_branch(ref)
    if branch is None:
        return []
    rows = (await db.execute(
        select(Project.id).where(
            Project.repo_full_name == repo_full_name,
            Project.repo_default_branch == branch,
        )
    )).scalars().all()
    return list(rows)
