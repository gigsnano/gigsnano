"""GIN-335/339: forecast recalc scheduler sweep.

Uses the injected `db_session` (not the module-level async_session(), which ignores
the get_db override and talks to prod). The per-project recalc/alert behavior is
covered in test_forecast_snapshots / test_forecast_alerts; here we check the sweep
loops projects and is idempotent (no duplicate history on an unchanged repeat).
"""

from sqlalchemy import func, select

from gigsnano_api.features.forecasting.scheduler import _sweep
from gigsnano_api.models import ForecastSnapshot
from tests.test_stories import setup_project


async def test_sweep_creates_then_dedups(client, db_session):
    project = await setup_project(client)

    created = await _sweep(db=db_session)
    assert created >= 1  # at least this project got a first snapshot

    count = (
        await db_session.execute(
            select(func.count())
            .select_from(ForecastSnapshot)
            .where(ForecastSnapshot.project_id == project["id"])
        )
    ).scalar_one()
    assert count == 1

    # Nothing changed between sweeps → no new history rows.
    again = await _sweep(db=db_session)
    assert again == 0
    count2 = (
        await db_session.execute(
            select(func.count())
            .select_from(ForecastSnapshot)
            .where(ForecastSnapshot.project_id == project["id"])
        )
    ).scalar_one()
    assert count2 == 1
