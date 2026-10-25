"""The request session must hand its pooled connection back before the request's
background tasks run. FastAPI runs BackgroundTasks inside the dependency exit
stack, so without that a slow task (an email, a clone, an index) pins a
connection for its whole run and a burst of them drains the pool."""

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from gigsnano_api.core import db as core_db
from gigsnano_api.core.db import get_db


async def _pooled_engine(tmp_path, monkeypatch):
    # A file database gets a real queue pool, so checkedout() is meaningful
    # (the shared fixture's StaticPool always reports one connection).
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'pool.db'}")
    monkeypatch.setattr(
        core_db, "async_session", async_sessionmaker(engine, expire_on_commit=False)
    )
    return engine


async def _call(app: FastAPI, method: str, path: str) -> httpx.Response:
    # ASGITransport returns only after the app (background tasks included) finishes.
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path)


async def test_connection_is_back_in_the_pool_while_a_background_task_runs(tmp_path, monkeypatch):
    engine = await _pooled_engine(tmp_path, monkeypatch)
    checked_out_during_task: list[int] = []

    async def slow_task() -> None:
        checked_out_during_task.append(engine.pool.checkedout())

    app = FastAPI()

    @app.post("/work/")
    async def work(background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
        await db.execute(text("select 1"))  # checks a connection out of the pool
        background.add_task(slow_task)
        return {"ok": True}

    response = await _call(app, "POST", "/work/")

    assert response.status_code == 200
    assert checked_out_during_task == [0]
    await engine.dispose()


async def test_streaming_route_can_still_query_the_session_inside_its_generator(
    tmp_path, monkeypatch
):
    engine = await _pooled_engine(tmp_path, monkeypatch)
    app = FastAPI()

    @app.get("/stream/")
    async def stream(db: AsyncSession = Depends(get_db)):
        async def events():
            for n in (1, 2):
                value = (await db.execute(text(f"select {n}"))).scalar_one()
                yield f"data: {value}\n\n"

        return StreamingResponse(events(), media_type="text/event-stream")

    response = await _call(app, "GET", "/stream/")

    assert response.text == "data: 1\n\ndata: 2\n\n"
    assert engine.pool.checkedout() == 0
    await engine.dispose()
