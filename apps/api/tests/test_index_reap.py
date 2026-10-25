"""A restart-interrupted index must not sit at INDEXING forever."""

import pytest

from gigsnano_api.models import EIndexStatus
from gigsnano_api.workspace.code_index import reap_interrupted_indexes


@pytest.mark.parametrize("stuck", [EIndexStatus.PENDING, EIndexStatus.INDEXING])
async def test_reap_fails_interrupted_runs(db_session, make_project, stuck):
    doomed = await make_project(index_status=stuck)
    ready = await make_project(index_status=EIndexStatus.READY)

    assert await reap_interrupted_indexes(db_session) == 1

    await db_session.refresh(doomed)
    await db_session.refresh(ready)
    assert doomed.index_status is EIndexStatus.FAILED
    assert "restart" in doomed.index_error
    # A finished index is not someone else's dead run — leave it alone.
    assert ready.index_status is EIndexStatus.READY


async def test_reap_is_a_noop_when_nothing_is_running(db_session, make_project):
    ready = await make_project(index_status=EIndexStatus.READY)
    assert await reap_interrupted_indexes(db_session) == 0
    await db_session.refresh(ready)
    assert ready.index_status is EIndexStatus.READY
