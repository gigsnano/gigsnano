from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import BackgroundTasks
from sqlalchemy import DateTime, String
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from gigsnano_api.core.config import settings

# pool_pre_ping: Azure Postgres (and the gateway in front of it) silently drops
# idle connections, so the pool hands back a dead one and the first query raises
# InterfaceError("connection is closed"). Request handlers turn that into a
# one-off 500 and self-heal on the retry, which is why it went unnoticed — but a
# background task has no retry, and the digest scheduler died on exactly this.
# Pre-ping checks liveness and transparently reconnects before handing one out.
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampedBase(Base):
    """Common columns: string-UUID pk + created/updated timestamps.

    Frontend contract: `ID = string`, timestamps are ISO strings.
    """

    __abstract__ = True

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


def release_before_background(session: AsyncSession, background: BackgroundTasks) -> None:
    """Hand the request session's connection back to the pool before the
    request's background tasks run.

    FastAPI runs BackgroundTasks inside the dependency exit stack, so a yield
    dependency's teardown waits for every task. A slow task (email, clone,
    index, import) would otherwise pin a pooled connection for its whole run,
    and a burst of them drains the pool. Dependencies resolve before the
    endpoint body, so this close is queued ahead of any task the endpoint adds;
    streaming responses run their tasks only after the body is fully sent.
    Background tasks open their own sessions and never use this one.
    """
    background.add_task(session.close)


async def get_db(background: BackgroundTasks) -> AsyncIterator[AsyncSession]:
    async with async_session() as session:
        release_before_background(session, background)
        yield session


@asynccontextmanager
async def async_session_scope() -> AsyncIterator[AsyncSession]:
    """Open a short-lived session for CLI / one-shot scripts.

    Feature libraries must take an injected session (tests pass ``db_session``).
    Only this helper — living in ``core/db.py`` — may call ``async_session()``,
    so ``python_doctor``'s bare-session house rule stays green.
    """
    async with async_session() as session:
        yield session
